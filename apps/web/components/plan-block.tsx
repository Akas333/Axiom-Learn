import { useEffect, useMemo, useRef, useState } from "react";
import { MaximizeIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fitGraphView, fitZoomFor, zoomedGraphView, type Viewport } from "@/components/pan-zoom";
import { conceptNumbers, PLAN_MAP_CHAT_WIDTH, PlanMap, planLayout } from "@/components/plan-map";
import type { PlanBlockData, PlanNodeProgress, PlanNodeStatus, PlanTree } from "@/src/core";
import { derivePlanStatuses, nodeProgress } from "@/src/core";
import { Hint } from "@/components/ui/hint";

/**
 * PLAN BLOCKS — the plan lives in the chat (wave 4): persisted
 * `data-plan-block` parts render in the transcript flow, and clicking one
 * opens the full plan in a session-scoped focus overlay (absolute inside
 * the session area, below the drag bar) — the LIVE plan: the latest tree
 * from the transcript with statuses derived at click time (contracts/
 * plan.ts derivePlanStatuses). Blocks are frozen snapshots rendered
 * exactly as carried (never re-derived); the popup is the live view.
 *
 * Both draw the plan map (plan-map.tsx) — the round numbered nodes the
 * side panel and the course card use; the boxed dagre diagram is retired
 * (owner, 2026-10-29: one plan drawing, kept small in the chat).
 */

/** A snapshot status as the map's progress. */
const BLOCK_PROGRESS: Record<PlanNodeStatus, PlanNodeProgress> = {
	current: "current",
	visited: "done",
	upcoming: "upcoming",
};

/**
 * A persisted plan-block part, rendered as carried (snapshot statuses,
 * never re-derived); it opens the live plan popup.
 */
export function PlanBlock({ data, onOpen }: { data: PlanBlockData; onOpen: () => void }) {
	const tree = useMemo<PlanTree>(
		() => ({ nodes: data.nodes.map((n) => ({ id: n.id, title: n.title })), edges: data.edges, version: 0 }),
		[data],
	);
	const layout = useMemo(() => planLayout(tree), [tree]);
	const progress = useMemo(() => new Map(data.nodes.map((n) => [n.id, BLOCK_PROGRESS[n.status]] as const)), [data]);
	return (
		<Hint label="Open the full plan" side="bottom">
			<button
				type="button"
				data-testid="plan-block-full"
				aria-label="Open the full plan"
				onClick={onOpen}
				className={cn("mx-auto my-2 block w-full text-left", PLAN_MAP_CHAT_WIDTH)}
			>
				{/* The button opens the popup; a node click just bubbles to it. */}
				<PlanMap tree={tree} layout={layout} progressOf={(id) => progress.get(id) ?? "upcoming"} viewingId={null} onSelect={() => {}} />
			</button>
		</Hint>
	);
}

// ─── The live plan popup ──────────────────────────────────────────────────────

/** Minimal structural message slice (same trick as phases.ts). */
export interface PopupMessage {
	parts: ReadonlyArray<{ type: string; state?: string; input?: unknown; output?: unknown }>;
}

/** The latest plan tree in the transcript (latest tool-plan_ output). */
export function latestTree(messages: readonly PopupMessage[]): PlanTree | null {
	for (let m = messages.length - 1; m >= 0; m--) {
		const parts = messages[m]?.parts;
		if (!parts) continue;
		for (let p = parts.length - 1; p >= 0; p--) {
			const part = parts[p]!;
			if (!part.type.startsWith("tool-plan_") || part.state !== "output-available") continue;
			const output = part.output as { tree?: PlanTree } | undefined;
			if (output?.tree && Array.isArray(output.tree.nodes)) return output.tree;
		}
	}
	return null;
}

/** The current node's glow (plan-map: a blurred disc R+4, σ 5) reaches
 *  ~20 units past its node — the popup's frame pads by that much so the
 *  blur never clips at the edge. */
const POPUP_PAD = 20;

// The pan/zoom math now lives in components/pan-zoom.ts (shared with the
// mermaid focus overlay since the session-overlay wave, 2026-09-19) — same
// fit-floor semantics: fully zoomed out IS the fit, panning locks at the
// floor, zoom ceiling 4× for reading node titles closely.

/**
 * The full plan, live: latest tree + statuses derived at click time. Esc,
 * backdrop click, or the X close it; drag pans, wheel zooms to the cursor,
 * the zoom floor is the fit (panning locks at it — nothing to move).
 *
 * SESSION-SCOPED since the chrome-melt wave (2026-09-19): it mounts
 * ABSOLUTE inside the chat page's session-area div (chat.tsx) — below the
 * 60px drag bar, right of the sidebar — instead of a fixed inset-0 overlay.
 * The top bar stays sharp and draggable, and the X can never land in drag
 * territory. Surface 80% + blur (owner decision): the transcript ghosts
 * through while the focus owns the session area.
 */
export function PlanPopup({ messages, onClose }: { messages: readonly PopupMessage[]; onClose: () => void }) {
	const tree = useMemo(() => latestTree(messages), [messages]);
	const statuses = useMemo(
		() => (tree ? derivePlanStatuses(tree, messages as Parameters<typeof derivePlanStatuses>[1]) : null),
		[tree, messages],
	);
	const progressOf = (id: string): PlanNodeProgress => (statuses ? nodeProgress(statuses, id) : "upcoming");

	// Esc closes — claimed at the DOCUMENT level (THE ONE-ESC LAW, owner
	// keyboard round 2026-10-06): a surfaced layer's Esc is exactly one
	// action. The window-level chain (dictation cancel → abort) is the
	// fallback for when NOTHING is surfaced; a window listener here could
	// never stop it — same-node listeners all fire — which was the
	// plan-open-while-dictating double-act (Esc closed the plan AND
	// cancelled the dictation).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	// ── pan/zoom viewport (harvested semantics: fit floor = the default) ──
	const viewportRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });
	useEffect(() => {
		const el = viewportRef.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const layout = useMemo(() => (tree ? planLayout(tree) : null), [tree]);
	// The side panel's numbering: taught concepts in the order taught.
	const numbers = useMemo(
		() => (tree && layout ? conceptNumbers(tree, layout, messages as Parameters<typeof conceptNumbers>[2], statuses?.current).number : undefined),
		[tree, layout, messages, statuses],
	);
	// The fit box is the PADDED ink box — the diagram renders with POPUP_PAD
	// (= the glow's reach) so the blurred glow never clips at the frame, and
	// the fit must account for that padding.
	const box = useMemo(
		() => (layout ? { w: layout.width + 2 * POPUP_PAD, h: layout.height + 2 * POPUP_PAD } : { w: 0, h: 0 }),
		[layout],
	);
	const fitZoom = useMemo(() => fitZoomFor(box, size), [box, size]);

	const [view, setView] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
	const userAdjustedRef = useRef(false);
	const atFloor = view.zoom <= fitZoom + 1e-9;
	// The transition stays off until the FIRST fit has been applied — the
	// popup paints at the fit directly instead of flying in from the initial
	// top-left zoom:1 state (owner, plan-graph round 4).
	const [settled, setSettled] = useState(false);

	useEffect(() => {
		if (atFloor) userAdjustedRef.current = false;
	}, [atFloor]);
	useEffect(() => {
		if (userAdjustedRef.current || !size.w || !size.h) return;
		setView(fitGraphView(box, size, fitZoom));
		// Enable the transition only AFTER the fit has painted: flipping
		// settled in the SAME commit lets the browser animate from the
		// initial top-left zoom:1 state — the fly-in the owner keeps
		// seeing (round 4's gate wasn't enough; round 7 fix).
		const raf = requestAnimationFrame(() => setSettled(true));
		return () => cancelAnimationFrame(raf);
	}, [fitZoom, size, box]);

	useEffect(() => {
		const el = viewportRef.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
			const factor = Math.exp(-dy * 0.0015);
			const rect = el.getBoundingClientRect();
			setView((v) =>
				zoomedGraphView(v, factor, fitZoom, { x: e.clientX - rect.left, y: e.clientY - rect.top }, box, size),
			);
			userAdjustedRef.current = true;
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [fitZoom, box, size]);

	// Smooth zoom: the transform eases between states (CSS retargets from the
	// current computed value, so chained wheel ticks stay fluid). Panning is
	// per-frame — the transition is off while dragging or it rubber-bands.
	const [panning, setPanning] = useState(false);
	const dragRef = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
	const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		if ((e.target as HTMLElement).closest("button")) return;
		if (atFloor) return;
		dragRef.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y, moved: false };
		setPanning(true);
		e.currentTarget.classList.add("cursor-grabbing");
		e.currentTarget.setPointerCapture(e.pointerId);
	};
	const moveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
		const d = dragRef.current;
		if (!d) return;
		d.moved = true;
		setView((v) =>
			v.zoom <= fitZoom + 1e-9 ? v : { ...v, x: d.x + (e.clientX - d.px), y: d.y + (e.clientY - d.py) },
		);
	};
	const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
		const d = dragRef.current;
		if (d) {
			dragRef.current = null;
			if (d.moved) userAdjustedRef.current = true;
		}
		setPanning(false);
		e.currentTarget.classList.remove("cursor-grabbing");
	};
	const stepZoom = (factor: number) => {
		userAdjustedRef.current = true;
		setView((v) => zoomedGraphView(v, factor, fitZoom, { x: size.w / 2, y: size.h / 2 }, box, size));
	};
	const fitView = () => {
		userAdjustedRef.current = false;
		if (!size.w || !size.h) return;
		setView(fitGraphView(box, size, fitZoom));
	};

	return (
		<div
			data-testid="plan-popup"
			// SESSION-SCOPED (absolute, not fixed): the chat page mounts this
			// INSIDE the session-area div — below the drag bar, right of the
			// sidebar. 80% + blur: the transcript ghosts through.
			className="absolute inset-0 z-40 flex flex-col bg-background/80 p-4 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
			aria-label="The full plan"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="mb-2 flex items-center gap-2">
				<span className="text-sm font-medium">The plan</span>
				<span className="text-xs text-muted-foreground">live — statuses derive from your check outcomes</span>
				<Hint label="Close" binding="escape" side="left">
<button
					type="button"
					onClick={onClose}
					aria-label="Close"
					data-testid="plan-popup-close"
					className="ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<XIcon className="size-4" />
				</button>
</Hint>
			</div>
			<div
				ref={viewportRef}
				className={cn(
					"relative min-h-0 flex-1 touch-none overflow-hidden rounded-xl border select-none",
					atFloor ? "cursor-default" : "cursor-grab",
				)}
				onPointerDown={startDrag}
				onPointerMove={moveDrag}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
			>
				{tree && layout ? (
					<>
						<div
							className="absolute top-0 left-0 origin-top-left"
							style={{
								transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
								// Hidden until the first fit has APPLIED — the fit runs in an
								// effect (after paint), so an opacity-gated chart can never flash
								// at the initial top-left zoom:1 state (same fix as the mermaid
								// overlay; transition-gating alone didn't hide the fly-in the
								// owner kept seeing in rounds 4–7).
								opacity: settled ? 1 : 0,
								transition:
									panning || !settled
										? "none"
										: "transform 180ms ease-out, opacity 160ms ease-out",
							}}
						>
							<div style={{ padding: POPUP_PAD }}>
								<PlanMap tree={tree} layout={layout} numbers={numbers} progressOf={progressOf} viewingId={null} onSelect={() => {}} naturalSize />
							</div>
						</div>
						<div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-2">
							<span className="text-xs text-muted-foreground/60">Drag to pan · scroll to zoom</span>
							<div className="flex gap-1">
								<Hint label="Zoom out" side="bottom">
<button
									type="button"
									aria-label="Zoom out"
									onClick={() => stepZoom(1 / 1.25)}
									className="pointer-events-auto flex size-7 items-center justify-center rounded-md border border-border/70 bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
								>
									<MinusIcon className="size-3.5" />
								</button>
</Hint>
								<Hint label="Fit plan to screen" side="bottom">
<button
									type="button"
									aria-label="Fit plan to screen"
									onClick={fitView}
									data-testid="plan-popup-fit"
									className="pointer-events-auto flex size-7 items-center justify-center rounded-md border border-border/70 bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
								>
									<MaximizeIcon className="size-3.5" />
								</button>
</Hint>
								<Hint label="Zoom in" side="bottom">
<button
									type="button"
									aria-label="Zoom in"
									onClick={() => stepZoom(1.25)}
									className="pointer-events-auto flex size-7 items-center justify-center rounded-md border border-border/70 bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
								>
									<PlusIcon className="size-3.5" />
								</button>
</Hint>
							</div>
						</div>
					</>
				) : (
					<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
						No plan in this session yet.
					</div>
				)}
			</div>
		</div>
	);
}