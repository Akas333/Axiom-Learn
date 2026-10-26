/**
 * Sphere view of the knowledge graph: the nodes wrapped onto a slowly
 * turning globe, drawn as small dots joined by thin mesh lines (the look of
 * the dev.meta.ai Muse Code hero). A faint decorative lattice fills the
 * sphere so it reads as a globe even when the graph is small.
 *
 * Same public API and callbacks as GraphCanvasRenderer, so graph-view can
 * swap between the two. The sphere is view-only: no live physics, so
 * onCommit never fires. Drag rotates, wheel zooms, click selects.
 *
 * Layout: each node keeps its flat-layout bearing around the graph centre
 * (longitude), and its distance rank from the centre becomes latitude on an
 * equal-area scale. Neighbours on the flat map stay neighbours on the globe,
 * and the dots spread evenly instead of piling up at one pole.
 */

import type { GraphRenderSettings } from "@/src/core";
import type { CanvasData, CanvasNode, RendererCallbacks } from "./graph-canvas.ts";
import { isImpNodeId } from "./graph-canvas.ts";

type Vec3 = [number, number, number];

const LATTICE_POINTS = 900;
const LATTICE_NEIGHBORS = 4;
const AUTO_SPIN = 0.00006; // radians per ms (one turn ≈ 105 s)
const DRAG_SPEED = 0.006; // radians per screen px
const INERTIA_DECAY = 0.0035; // per ms
const CLICK_SLOP = 4;
const PICK_RADIUS = 14; // screen px
const ARC_STEPS = 10;
const PERSPECTIVE = 2.8; // camera distance in sphere radii
const FIT_RADIUS = 0.4; // sphere radius as a share of min(view w, h)

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function rgba(hex: string, a: number): string {
	const h = hex.replace("#", "");
	const r = parseInt(h.slice(0, 2), 16) || 0;
	const g = parseInt(h.slice(2, 4), 16) || 0;
	const b = parseInt(h.slice(4, 6), 16) || 0;
	return `rgba(${r},${g},${b},${clamp(a, 0, 1).toFixed(3)})`;
}

/** Even points on the unit sphere (golden-angle spiral), nudged by a small
 *  fixed jitter so the mesh reads organic rather than as a grid. */
function fibonacciSphere(n: number): Vec3[] {
	const out: Vec3[] = [];
	const golden = Math.PI * (3 - Math.sqrt(5));
	const spacing = Math.sqrt((4 * Math.PI) / n);
	let seed = 1337;
	const rand = () => {
		seed = (seed * 16807) % 2147483647;
		return seed / 2147483647 - 0.5;
	};
	for (let i = 0; i < n; i++) {
		const y = 1 - (2 * (i + 0.5)) / n;
		const r = Math.sqrt(1 - y * y);
		const t = golden * i;
		const x = Math.cos(t) * r + rand() * spacing * 0.45;
		const yy = y + rand() * spacing * 0.45;
		const z = Math.sin(t) * r + rand() * spacing * 0.45;
		const len = Math.hypot(x, yy, z) || 1;
		out.push([x / len, yy / len, z / len]);
	}
	return out;
}

/** Edges joining each point to its nearest neighbours (deduplicated). */
function nearestEdges(points: Vec3[], k: number): [number, number][] {
	const seen = new Set<string>();
	const edges: [number, number][] = [];
	for (let i = 0; i < points.length; i++) {
		const p = points[i]!;
		// Keep only the k best (sorted insert) — O(n·k) per point.
		const dists: { j: number; d: number }[] = [];
		for (let j = 0; j < points.length; j++) {
			if (i === j) continue;
			const q = points[j]!;
			const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
			if (dists.length === k && d >= dists[k - 1]!.d) continue;
			let at = dists.length;
			while (at > 0 && dists[at - 1]!.d > d) at--;
			dists.splice(at, 0, { j, d });
			if (dists.length > k) dists.pop();
		}
		for (let m = 0; m < dists.length; m++) {
			const j = dists[m]!.j;
			const key = i < j ? `${i}:${j}` : `${j}:${i}`;
			if (seen.has(key)) continue;
			seen.add(key);
			edges.push([i, j]);
		}
	}
	return edges;
}

/** Points along the great-circle arc a→b (unit vectors). */
function slerpArc(a: Vec3, b: Vec3, steps: number): Vec3[] {
	const dot = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
	const omega = Math.acos(dot);
	if (omega < 1e-4) return [a, b];
	const s = Math.sin(omega);
	const out: Vec3[] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const wa = Math.sin((1 - t) * omega) / s;
		const wb = Math.sin(t * omega) / s;
		out.push([a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb]);
	}
	return out;
}

/** Lattices are cached by point count (the backdrop uses a denser one). */
const latticeCache = new Map<number, { points: Vec3[]; edges: [number, number][] }>();
function lattice(count: number) {
	let hit = latticeCache.get(count);
	if (!hit) {
		const points = fibonacciSphere(count);
		hit = { points, edges: nearestEdges(points, LATTICE_NEIGHBORS) };
		latticeCache.set(count, hit);
	}
	return hit;
}

interface Projected {
	x: number;
	y: number;
	z: number; // -1 (back) .. 1 (front)
	s: number; // perspective scale
}

export class GraphSphereRenderer {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private callbacks: RendererCallbacks;
	private data: CanvasData | null = null;
	private settings: GraphRenderSettings | null = null;
	private visible: ReadonlySet<string> | null = null;
	private clusterLabels = new Map<string, string | null>();

	/** Unit-sphere position per node id. */
	private pos = new Map<string, Vec3>();
	private nodeById = new Map<string, CanvasNode>();
	private edgeArcs: { from: string; to: string; arc: Vec3[] }[] = [];
	private clusterCenters: { id: string; label: string | null; at: Vec3 }[] = [];

	// Camera: yaw/pitch rotation + zoom on the fitted radius.
	private yaw = 0.6;
	private pitch = -0.25;
	private zoom = 1;
	private spinVel = 0; // yaw velocity from a released drag (rad/ms)
	private pitchVel = 0;
	private autoSpin = true;
	private reducedMotion = false;

	private viewW = 0;
	private viewH = 0;
	private dpr = 1;
	private frameId: number | null = null;
	private lastT = 0;

	private hoverId: string | null = null;
	private pointerInside = false; // slows the spin so dots are easier to hit
	private downPos: { x: number; y: number } | null = null;
	private lastDrag: { x: number; y: number; t: number } | null = null;
	private dragging = false;
	private resizeObserver: ResizeObserver;

	private lattice: { points: Vec3[]; edges: [number, number][] };

	constructor(
		canvas: HTMLCanvasElement,
		callbacks: RendererCallbacks,
		options: { latticePoints?: number } = {},
	) {
		this.lattice = lattice(options.latticePoints ?? LATTICE_POINTS);
		this.canvas = canvas;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("2d context unavailable");
		this.ctx = ctx;
		this.callbacks = callbacks;
		try {
			this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		} catch {
			this.reducedMotion = false;
		}

		canvas.addEventListener("pointerdown", this.onPointerDown);
		canvas.addEventListener("pointermove", this.onPointerMove);
		canvas.addEventListener("pointerup", this.onPointerUp);
		canvas.addEventListener("pointerleave", this.onPointerLeave);
		canvas.addEventListener("wheel", this.onWheel, { passive: false });
		canvas.addEventListener("contextmenu", this.onContextMenu);

		this.resizeObserver = new ResizeObserver(() => {
			this.syncSize();
			this.draw();
		});
		this.resizeObserver.observe(canvas);
		this.syncSize();
		this.lastT = performance.now();
		this.frameId = requestAnimationFrame(this.tick);
	}

	// ── Public API (mirrors GraphCanvasRenderer) ──

	setData(data: CanvasData): void {
		this.data = data;
		this.nodeById = new Map(data.nodes.map((n) => [n.id, n]));
		this.layout();
		this.draw();
	}

	setSettings(settings: GraphRenderSettings): void {
		this.settings = settings;
		this.draw();
	}

	// The sphere has no regions or physics; accepted for API parity.
	setRegionTuning(_input: unknown): void {}
	setPhysicsTuning(_input: unknown): void {}

	setClusterLabels(labels: ReadonlyMap<string, string | null>): void {
		for (const [id, label] of labels) this.clusterLabels.set(id, label);
		for (const c of this.clusterCenters) if (labels.has(c.id)) c.label = labels.get(c.id) ?? null;
		this.draw();
	}

	setVisible(visible: ReadonlySet<string> | null): void {
		this.visible = visible;
		if (this.hoverId && visible && !visible.has(this.hoverId)) this.hoverId = null;
		this.draw();
	}

	fit(): void {
		this.zoom = 1;
		this.draw();
	}

	/** Zoom relative to the fitted sphere (1 = whole globe in view). */
	setZoom(k: number): void {
		this.zoom = clamp(k, 0.5, 6);
		this.draw();
	}

	destroy(): void {
		if (this.frameId !== null) cancelAnimationFrame(this.frameId);
		this.frameId = null;
		this.resizeObserver.disconnect();
		const c = this.canvas;
		c.removeEventListener("pointerdown", this.onPointerDown);
		c.removeEventListener("pointermove", this.onPointerMove);
		c.removeEventListener("pointerup", this.onPointerUp);
		c.removeEventListener("pointerleave", this.onPointerLeave);
		c.removeEventListener("wheel", this.onWheel);
		c.removeEventListener("contextmenu", this.onContextMenu);
		c.style.cursor = "";
	}

	// ── Layout: flat positions → unit sphere ──

	private layout(): void {
		const data = this.data;
		this.pos.clear();
		this.edgeArcs = [];
		this.clusterCenters = [];
		if (!data || data.nodes.length === 0) return;

		let cx = 0;
		let cy = 0;
		for (const n of data.nodes) {
			cx += n.x;
			cy += n.y;
		}
		cx /= data.nodes.length;
		cy /= data.nodes.length;

		// Distance rank → equal-area latitude; bearing → longitude.
		const ranked = data.nodes
			.map((n) => ({ n, r: Math.hypot(n.x - cx, n.y - cy), a: Math.atan2(n.y - cy, n.x - cx) }))
			.sort((p, q) => p.r - q.r);
		const count = ranked.length;
		ranked.forEach(({ n, a }, i) => {
			const p = count === 1 ? 0.5 : (i + 0.5) / count;
			const polar = Math.acos(1 - 2 * p); // 0 at the front pole
			const sp = Math.sin(polar);
			// Front pole faces +z; longitude turns around it.
			this.pos.set(n.id, [sp * Math.cos(a), sp * Math.sin(a), Math.cos(polar)]);
		});

		for (const e of data.edges) {
			const a = this.pos.get(e.from);
			const b = this.pos.get(e.to);
			if (!a || !b) continue;
			this.edgeArcs.push({ from: e.from, to: e.to, arc: slerpArc(a, b, ARC_STEPS) });
		}

		for (const c of data.clusters) {
			let x = 0;
			let y = 0;
			let z = 0;
			for (const m of c.members) {
				const p = this.pos.get(m);
				if (!p) continue;
				x += p[0];
				y += p[1];
				z += p[2];
			}
			const len = Math.hypot(x, y, z);
			if (len < 1e-6) continue;
			const label = this.clusterLabels.has(c.id) ? (this.clusterLabels.get(c.id) ?? null) : c.label;
			this.clusterCenters.push({ id: c.id, label, at: [x / len, y / len, z / len] });
		}
	}

	// ── Projection ──

	private radius(): number {
		return Math.min(this.viewW, this.viewH) * FIT_RADIUS * this.zoom;
	}

	private project(p: Vec3): Projected {
		const cyaw = Math.cos(this.yaw);
		const syaw = Math.sin(this.yaw);
		const cp = Math.cos(this.pitch);
		const sp = Math.sin(this.pitch);
		// Yaw around Y, then pitch around X.
		const x1 = p[0] * cyaw + p[2] * syaw;
		const z1 = -p[0] * syaw + p[2] * cyaw;
		const y2 = p[1] * cp - z1 * sp;
		const z2 = p[1] * sp + z1 * cp;
		const s = PERSPECTIVE / (PERSPECTIVE - z2);
		const r = this.radius();
		// Sit slightly above centre: the composer overlaps the bottom edge.
		return { x: this.viewW / 2 + x1 * r * s, y: this.viewH * 0.46 + y2 * r * s, z: z2, s };
	}

	/** Depth → opacity: back of the sphere fades, front is full. */
	private depthAlpha(z: number, back: number, front: number): number {
		const t = (z + 1) / 2;
		return back + (front - back) * t * t;
	}

	private isShown(id: string): boolean {
		return !this.visible || this.visible.has(id);
	}

	// ── Loop ──

	private tick = (t: number): void => {
		const dt = Math.min(t - this.lastT, 64);
		this.lastT = t;
		if (!this.dragging) {
			if (Math.abs(this.spinVel) > 1e-6 || Math.abs(this.pitchVel) > 1e-6) {
				this.yaw += this.spinVel * dt;
				this.pitch = clamp(this.pitch + this.pitchVel * dt, -1.3, 1.3);
				const decay = Math.exp(-INERTIA_DECAY * dt);
				this.spinVel *= decay;
				this.pitchVel *= decay;
			} else if (this.autoSpin && !this.reducedMotion && this.hoverId === null) {
				this.yaw += AUTO_SPIN * dt * (this.pointerInside ? 0.25 : 1);
			}
		}
		this.draw();
		this.frameId = requestAnimationFrame(this.tick);
	};

	private syncSize(): void {
		const w = this.canvas.clientWidth;
		const h = this.canvas.clientHeight;
		const dpr = window.devicePixelRatio || 1;
		if (w === this.viewW && h === this.viewH && dpr === this.dpr) return;
		this.viewW = w;
		this.viewH = h;
		this.dpr = dpr;
		this.canvas.width = Math.max(1, Math.round(w * dpr));
		this.canvas.height = Math.max(1, Math.round(h * dpr));
	}

	private draw(): void {
		const ctx = this.ctx;
		const { viewW: w, viewH: h, dpr } = this;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);
		const data = this.data;
		if (!data || w === 0 || h === 0) return;

		const nodeHex = data.colors.node;
		const edgeHex = data.colors.edge;
		const labelHex = data.colors.label;
		const hoverHex = data.colors.hoverText;

		// 1. Decorative lattice — the globe itself.
		const lattice = this.lattice.points.map((p) => this.project(p));
		ctx.lineWidth = 0.6;
		for (const [i, j] of this.lattice.edges) {
			const a = lattice[i]!;
			const b = lattice[j]!;
			const z = (a.z + b.z) / 2;
			ctx.strokeStyle = rgba(edgeHex, this.depthAlpha(z, 0.03, 0.2));
			ctx.beginPath();
			ctx.moveTo(a.x, a.y);
			ctx.lineTo(b.x, b.y);
			ctx.stroke();
		}
		for (const p of lattice) {
			ctx.fillStyle = rgba(nodeHex, this.depthAlpha(p.z, 0.08, 0.55));
			ctx.beginPath();
			ctx.arc(p.x, p.y, 1.1 * p.s, 0, Math.PI * 2);
			ctx.fill();
		}

		// 2. Graph edges as great-circle arcs, depth-faded per segment.
		const hover = this.hoverId;
		const edgeW = clamp((this.settings?.edgeWidth ?? 1) * 0.9, 0.5, 3);
		ctx.lineWidth = edgeW;
		for (const e of this.edgeArcs) {
			if (!this.isShown(e.from) || !this.isShown(e.to)) continue;
			const lit = hover !== null && (e.from === hover || e.to === hover);
			const pts = e.arc.map((p) => this.project(p));
			for (let i = 0; i < pts.length - 1; i++) {
				const a = pts[i]!;
				const b = pts[i + 1]!;
				const z = (a.z + b.z) / 2;
				ctx.strokeStyle = lit ? rgba(hoverHex, this.depthAlpha(z, 0.25, 0.9)) : rgba(edgeHex, this.depthAlpha(z, 0.05, 0.55));
				ctx.beginPath();
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(b.x, b.y);
				ctx.stroke();
			}
		}

		// 3. Nodes, back to front.
		const nodes: { n: CanvasNode; p: Projected }[] = [];
		for (const n of data.nodes) {
			if (isImpNodeId(n.id) || !this.isShown(n.id)) continue;
			const at = this.pos.get(n.id);
			if (at) nodes.push({ n, p: this.project(at) });
		}
		nodes.sort((a, b) => a.p.z - b.p.z);
		const baseR = clamp(1.6 + Math.sqrt(this.zoom), 2, 5);
		for (const { n, p } of nodes) {
			const isHover = n.id === hover;
			const r = baseR * p.s * (isHover ? 1.8 : 1);
			if (p.z > 0.2 || isHover) {
				// Soft glow on front-facing dots.
				const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
				g.addColorStop(0, rgba(nodeHex, isHover ? 0.45 : 0.18 * p.z));
				g.addColorStop(1, rgba(nodeHex, 0));
				ctx.fillStyle = g;
				ctx.beginPath();
				ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.fillStyle = rgba(nodeHex, isHover ? 1 : this.depthAlpha(p.z, 0.15, 1));
			ctx.beginPath();
			ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
			ctx.fill();
		}

		// 4. Cluster labels on the front face.
		const font = data.fontFamily;
		if (this.settings?.clusterLabels !== false && this.zoom < 2.2) {
			const size = this.settings?.clusterLabelSize ?? 14;
			ctx.font = `500 ${size}px ${font}`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			for (const c of this.clusterCenters) {
				if (!c.label) continue;
				const p = this.project(c.at);
				if (p.z < 0.25) continue;
				ctx.fillStyle = rgba(labelHex, clamp((p.z - 0.25) * 1.6, 0, 0.9));
				ctx.fillText(c.label, p.x, p.y);
			}
		}

		// 5. Node labels: front nodes once zoomed in, plus the hovered one.
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		ctx.font = `500 12px ${font}`;
		const showAll = this.zoom >= 1.8;
		for (const { n, p } of nodes) {
			const isHover = n.id === hover;
			if (!isHover && !(showAll && p.z > 0.55)) continue;
			const text = n.label.length > 48 ? `${n.label.slice(0, 47)}…` : n.label;
			ctx.fillStyle = isHover ? rgba(hoverHex, 1) : rgba(labelHex, clamp((p.z - 0.55) * 2.5, 0, 0.85));
			ctx.fillText(text, p.x + baseR * p.s + 6, p.y);
		}
	}

	// ── Picking ──

	private pick(x: number, y: number): string | null {
		const data = this.data;
		if (!data) return null;
		let best: string | null = null;
		let bestScore = Infinity;
		for (const n of data.nodes) {
			if (isImpNodeId(n.id) || !this.isShown(n.id)) continue;
			const at = this.pos.get(n.id);
			if (!at) continue;
			const p = this.project(at);
			if (p.z < -0.05) continue; // back face is not clickable
			const d = Math.hypot(p.x - x, p.y - y);
			if (d > PICK_RADIUS) continue;
			const score = d - p.z * 4; // prefer the nearer dot when stacked
			if (score < bestScore) {
				bestScore = score;
				best = n.id;
			}
		}
		return best;
	}

	private local(e: PointerEvent | MouseEvent): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	// ── Input ──

	private onPointerDown = (e: PointerEvent): void => {
		if (e.button !== 0) return;
		const pt = this.local(e);
		this.downPos = pt;
		this.lastDrag = { ...pt, t: performance.now() };
		this.spinVel = 0;
		this.pitchVel = 0;
		this.canvas.setPointerCapture(e.pointerId);
	};

	private onPointerMove = (e: PointerEvent): void => {
		this.pointerInside = true;
		const pt = this.local(e);
		if (this.downPos && this.lastDrag) {
			if (!this.dragging && Math.hypot(pt.x - this.downPos.x, pt.y - this.downPos.y) > CLICK_SLOP) {
				this.dragging = true;
				this.hoverId = null;
				this.canvas.style.cursor = "grabbing";
				this.callbacks.onCameraMove({ k: this.zoom, x: this.yaw, y: this.pitch });
			}
			if (this.dragging) {
				const now = performance.now();
				const dx = pt.x - this.lastDrag.x;
				const dy = pt.y - this.lastDrag.y;
				const dt = Math.max(now - this.lastDrag.t, 1);
				const speed = DRAG_SPEED / Math.sqrt(this.zoom);
				this.yaw += dx * speed;
				this.pitch = clamp(this.pitch + dy * speed, -1.3, 1.3);
				this.spinVel = (dx * speed) / dt;
				this.pitchVel = (dy * speed) / dt;
				this.lastDrag = { ...pt, t: now };
			}
			return;
		}
		const id = this.pick(pt.x, pt.y);
		if (id !== this.hoverId) {
			this.hoverId = id;
			this.canvas.style.cursor = id ? "pointer" : "grab";
		}
	};

	private onPointerUp = (e: PointerEvent): void => {
		const pt = this.local(e);
		const wasDrag = this.dragging;
		this.dragging = false;
		this.downPos = null;
		this.lastDrag = null;
		try {
			this.canvas.releasePointerCapture(e.pointerId);
		} catch {
			// not captured
		}
		this.canvas.style.cursor = "grab";
		if (wasDrag) {
			this.autoSpin = true;
			return;
		}
		const id = this.pick(pt.x, pt.y);
		if (id) {
			// Hold still while the card is anchored to the dot.
			this.autoSpin = false;
			this.spinVel = 0;
			this.pitchVel = 0;
			this.callbacks.onSelect(id, pt);
		} else {
			this.autoSpin = true;
			this.callbacks.onStageClick();
		}
	};

	private onPointerLeave = (): void => {
		this.pointerInside = false;
		if (this.dragging) return;
		this.hoverId = null;
	};

	private onWheel = (e: WheelEvent): void => {
		e.preventDefault();
		const factor = Math.exp(-e.deltaY * 0.0015);
		this.zoom = clamp(this.zoom * factor, 0.5, 6);
		this.callbacks.onCameraMove({ k: this.zoom, x: this.yaw, y: this.pitch });
	};

	private onContextMenu = (e: MouseEvent): void => {
		e.preventDefault();
		const pt = this.local(e);
		const id = this.pick(pt.x, pt.y);
		if (id) {
			this.autoSpin = false;
			this.spinVel = 0;
			this.pitchVel = 0;
		}
		this.callbacks.onContext(id, pt);
	};
}
