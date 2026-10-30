import { useEffect, useRef } from "react";

/** A theme colour as [r, g, b] (the tokens in globals.css are already hex). */
function tokenRgb(cssVar: string, fallback: [number, number, number]): [number, number, number] {
	const v = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
	if (!/^#[0-9a-f]{6}$/i.test(v)) return fallback;
	return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
}

const GLYPHS = "·:;+=*~^<>/\\|[]{}#%&@01".split("");
const glyphAt = (n: number) => GLYPHS[Math.abs(n | 0) % GLYPHS.length] ?? "·";
const INTRO_NOISE = 700; // ms of scattered static before it snaps to a grid
const INTRO_GRID = 650; // ms the grid holds before gathering into the globe
const INTRO_GATHER = 1500; // ms for the grid to fold into the sphere
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

type Particle = {
	/** Unit-sphere position. */
	x: number;
	y: number;
	z: number;
	/** Intro: where it appears as noise (fraction of the canvas), and its stagger. */
	nx: number;
	ny: number;
	delay: number;
	/** Glyph particles draw a character instead of a dot; it rescrambles now and then. */
	glyph: string | null;
	nextFlip: number;
	/** Screen-space spring offset from the pointer's push. */
	ox: number;
	oy: number;
	vx: number;
	vy: number;
	/** 0..1 how "stirred" it is: stirred dots briefly turn into glyphs. */
	heat: number;
};

/** Latitude rings of dots, denser at the equator — the banded look of a dotted globe. */
function buildSphere(rings: number): Particle[] {
	const out: Particle[] = [];
	for (let i = 1; i < rings; i++) {
		const lat = Math.PI * (i / rings) - Math.PI / 2;
		const r = Math.cos(lat);
		const count = Math.max(6, Math.round(rings * 2.1 * r));
		const offset = (i % 2) * (Math.PI / count);
		for (let j = 0; j < count; j++) {
			const lon = (j / count) * Math.PI * 2 + offset;
			out.push({
				x: r * Math.cos(lon),
				y: Math.sin(lat),
				z: r * Math.sin(lon),
				nx: Math.random(),
				ny: Math.random(),
				delay: Math.random(),
				glyph: Math.random() < 0.1 ? glyphAt(Math.random() * GLYPHS.length) : null,
				nextFlip: Math.random() * 4000,
				ox: 0,
				oy: 0,
				vx: 0,
				vy: 0,
				heat: 0,
			});
		}
	}
	return out;
}

/**
 * A turning globe of dots and flickering glyphs behind a hero (after Meta's
 * Muse Wonder page). On mount it plays an intro — scattered static snaps to a
 * dot grid, then folds into the sphere. Afterwards dots near the cursor
 * scatter and scramble into glyphs, dragging the globe spins it (with
 * inertia), and a click sends a ripple across it. Decorative: hidden from
 * assistive tech, pointer events pass through to the content on top, and it
 * fades toward the edges. The parent must be `relative` (the canvas fills it).
 */
export function SphereBackdrop({ zoom = 1 }: { zoom?: number }) {
	const ref = useRef<HTMLCanvasElement | null>(null);
	useEffect(() => {
		const canvas = ref.current;
		const host = canvas?.parentElement;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !host || !ctx) return;

		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const [cr, cg, cb] = tokenRgb("--foreground", [242, 244, 246]);
		const font = getComputedStyle(document.body).fontFamily;
		const particles = buildSphere(44);

		let w = 0;
		let h = 0;
		let dpr = 1;
		const resize = () => {
			dpr = Math.min(window.devicePixelRatio || 1, 2);
			w = canvas.clientWidth;
			h = canvas.clientHeight;
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(h * dpr);
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(canvas);

		// Pointer, in canvas coordinates: dots near it scatter and scramble.
		const pointer = { x: -1e4, y: -1e4, inside: false };
		// Grab-to-spin: yaw/pitch accumulate from drags and coast with inertia.
		let yaw = 0.6;
		let pitch = 0;
		let yawVel = 0; // rad/ms on top of the idle spin
		let pitchVel = 0;
		let radius = 0;
		const drag = { active: false, id: -1, x: 0, y: 0, t: 0, moved: 0 };
		const isBare = (target: EventTarget | null) =>
			!(target as HTMLElement | null)?.closest?.("button, a, input, textarea, select, [role=button], [contenteditable]");
		const onSphere = (x: number, y: number) => Math.hypot(x - w / 2, y - h / 2) < radius * 1.05;

		const onMove = (e: PointerEvent) => {
			const r = canvas.getBoundingClientRect();
			pointer.x = e.clientX - r.left;
			pointer.y = e.clientY - r.top;
			pointer.inside = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= r.width && pointer.y <= r.height;
			if (drag.active && e.pointerId === drag.id) {
				const dx = e.clientX - drag.x;
				const dy = e.clientY - drag.y;
				const dt = Math.max(e.timeStamp - drag.t, 1);
				const k = 1 / Math.max(radius, 1); // a drag the globe's radius long turns it ~1 rad
				// The front face follows the hand: +yaw/+pitch turn it left/up.
				yaw -= dx * k;
				pitch = Math.max(-1.2, Math.min(1.2, pitch - dy * k));
				// Smooth the release velocity so a flick carries but a jitter doesn't.
				yawVel = yawVel * 0.6 - ((dx * k) / dt) * 0.4;
				pitchVel = pitchVel * 0.6 - ((dy * k) / dt) * 0.4;
				drag.moved += Math.abs(dx) + Math.abs(dy);
				drag.x = e.clientX;
				drag.y = e.clientY;
				drag.t = e.timeStamp;
			} else {
				host.style.cursor = g >= 1 && onSphere(pointer.x, pointer.y) && isBare(e.target) ? "grab" : "";
			}
		};
		const onLeave = () => {
			pointer.inside = false;
			pointer.x = pointer.y = -1e4;
		};
		const ripples: { x: number; y: number; t: number }[] = [];
		const onDown = (e: PointerEvent) => {
			// Only grabs on the bare backdrop — not on inputs or buttons.
			if (e.button !== 0 || !isBare(e.target) || g < 1) return;
			const r = canvas.getBoundingClientRect();
			if (!onSphere(e.clientX - r.left, e.clientY - r.top)) {
				ripples.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() });
				return;
			}
			e.preventDefault(); // no text selection while spinning
			Object.assign(drag, { active: true, id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, moved: 0 });
			yawVel = pitchVel = 0;
			host.style.cursor = "grabbing";
			document.body.style.userSelect = "none";
		};
		const onUp = (e: PointerEvent) => {
			if (!drag.active || e.pointerId !== drag.id) return;
			drag.active = false;
			host.style.cursor = "grab";
			document.body.style.userSelect = "";
			// Held still before letting go: no fling.
			if (e.timeStamp - drag.t > 80) yawVel = pitchVel = 0;
			// A click without a drag ripples instead.
			if (drag.moved < 4) {
				const r = canvas.getBoundingClientRect();
				ripples.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() });
			}
		};
		window.addEventListener("pointermove", onMove, { passive: true });
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onUp);
		document.addEventListener("pointerleave", onLeave);
		host.addEventListener("pointerdown", onDown);

		const start = performance.now();
		let raf = 0;
		let last = start;
		let g = reduced ? 1 : 0; // intro progress; 1 once the globe has formed

		const frame = (now: number) => {
			const dt = Math.min(now - last, 50);
			last = now;
			const t = now - start;

			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, w, h);

			const cx = w / 2;
			const cy = h / 2;
			radius = Math.min(w, h * 1.15) * 0.42 * zoom;

			// Rotation: a slow idle spin plus the drag's yaw/pitch with inertia.
			// Hovering never turns the globe — only grabbing does.
			if (!drag.active) {
				yaw += (reduced ? 0 : 0.00009 * dt) + yawVel * dt;
				pitch = Math.max(-1.2, Math.min(1.2, pitch + pitchVel * dt));
				const decay = Math.exp(-dt / 900);
				yawVel *= decay;
				pitchVel *= decay;
				pitch *= Math.exp(-dt / 4000); // drift back upright
			}
			const ry = yaw;
			const rx = -0.32 + pitch;
			const cosY = Math.cos(ry);
			const sinY = Math.sin(ry);
			const cosX = Math.cos(rx);
			const sinX = Math.sin(rx);

			// Intro phases: 0 = noise, then grid, then gathering (g 0..1).
			const inNoise = t < INTRO_NOISE && !reduced;
			g = reduced ? 1 : clamp01((t - INTRO_NOISE - INTRO_GRID) / INTRO_GATHER);
			const gridStep = Math.max(14, Math.sqrt((w * h) / particles.length) * 0.95);

			while (ripples.length && now - (ripples[0]?.t ?? 0) > 1600) ripples.shift();

			const fontPx = 10;
			ctx.font = `${fontPx}px ${font}`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";

			for (const p of particles) {
				// Rotate (Y then X) and project with a gentle perspective.
				const x1 = p.x * cosY - p.z * sinY;
				const z1 = p.x * sinY + p.z * cosY;
				const y2 = p.y * cosX - z1 * sinX;
				const z2 = p.y * sinX + z1 * cosX;
				const persp = 1 / (1 - z2 * 0.28);
				let sx = cx + x1 * radius * persp;
				let sy = cy + y2 * radius * persp;
				const depth = (z2 + 1) / 2; // 0 back .. 1 front

				// Pointer push: a spring offset away from the cursor.
				if (g >= 1) {
					const dx = sx + p.ox - pointer.x;
					const dy = sy + p.oy - pointer.y;
					const d2 = dx * dx + dy * dy;
					const reach = 110;
					if (!drag.active && d2 < reach * reach && depth > 0.35) {
						const d = Math.sqrt(d2) || 1;
						const f = (1 - d / reach) ** 2 * 2.4;
						p.vx += (dx / d) * f;
						p.vy += (dy / d) * f;
						p.heat = Math.min(1, p.heat + f * 0.25);
					}
					for (const r of ripples) {
						const age = (now - r.t) / 1600;
						const front = age * Math.max(w, h) * 0.9;
						const dist = Math.hypot(sx - r.x, sy - r.y);
						const band = Math.abs(dist - front);
						if (band < 28) {
							const f = (1 - band / 28) * (1 - age) * 3;
							p.vx += ((sx - r.x) / (dist || 1)) * f;
							p.vy += ((sy - r.y) / (dist || 1)) * f;
							p.heat = Math.min(1, p.heat + f * 0.3);
						}
					}
					p.vx += -p.ox * 0.06;
					p.vy += -p.oy * 0.06;
					p.vx *= 0.82;
					p.vy *= 0.82;
					p.ox += p.vx;
					p.oy += p.vy;
					p.heat *= 0.965;
					sx += p.ox;
					sy += p.oy;
				}

				let alpha = 0.12 + depth * depth * 0.88;
				let size = 0.8 + depth * 1.3;

				if (g < 1) {
					// Noise position, then snapped to the grid, then folding into the globe.
					const fx = p.nx * w;
					const fy = p.ny * h;
					const gx = Math.round(fx / gridStep) * gridStep;
					const gy = Math.round(fy / gridStep) * gridStep;
					const snap = inNoise ? 0 : easeInOut(clamp01((t - INTRO_NOISE) / 320));
					const bx = fx + (gx - fx) * snap;
					const by = fy + (gy - fy) * snap;
					// Stagger the gather from the centre outwards.
					const dc = Math.hypot(bx - cx, by - cy) / Math.hypot(cx, cy);
					const k = easeInOut(clamp01((g - dc * 0.35) / 0.65));
					sx = bx + (sx - bx) * k;
					sy = by + (sy - by) * k;
					const appear = clamp01((t - p.delay * INTRO_NOISE * 0.8) / 200);
					const twinkle = inNoise ? 0.35 + 0.65 * Math.abs(Math.sin(t * 0.02 + p.delay * 40)) : 1;
					const flat = 0.55 * appear * twinkle;
					alpha = flat + (alpha - flat) * k;
					size = 1.1 + (size - 1.1) * k;
				}

				// Glyphs rescramble on their own timer; stirred dots show glyphs too.
				if (now - start > p.nextFlip) {
					p.nextFlip = now - start + 1200 + Math.random() * 5000;
					if (p.glyph) p.glyph = glyphAt(Math.random() * GLYPHS.length);
				}
				const glyph = p.heat > 0.25 ? glyphAt(sx * 7 + sy * 13 + now * 0.02) : g >= 1 ? p.glyph : null;

				ctx.fillStyle = `rgba(${cr},${cg},${cb},${Math.min(1, alpha + p.heat * 0.5).toFixed(3)})`;
				if (glyph && depth > 0.3) {
					ctx.fillText(glyph, sx, sy);
				} else {
					ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
				}
			}

			raf = requestAnimationFrame(frame);
		};

		const onVisibility = () => {
			cancelAnimationFrame(raf);
			if (!document.hidden) {
				last = performance.now();
				raf = requestAnimationFrame(frame);
			}
		};
		document.addEventListener("visibilitychange", onVisibility);
		raf = requestAnimationFrame(frame);

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onUp);
			host.style.cursor = "";
			document.body.style.userSelect = "";
			document.removeEventListener("pointerleave", onLeave);
			document.removeEventListener("visibilitychange", onVisibility);
			host.removeEventListener("pointerdown", onDown);
		};
	}, [zoom]);
	return (
		<canvas
			ref={ref}
			aria-hidden
			className="pointer-events-none absolute inset-0 block h-full w-full"
			style={{
				maskImage: "radial-gradient(ellipse at center, black 45%, transparent 85%)",
				WebkitMaskImage: "radial-gradient(ellipse at center, black 45%, transparent 85%)",
			}}
		/>
	);
}
