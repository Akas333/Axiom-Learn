import type { PlanNodeProgress, PlanTree } from "@/src/core";
import { cn } from "@/lib/utils";

/**
 * The plan map: a compact, app-styled drawing of the plan's dependency
 * graph — the app's one plan drawing (side panel, chat plan block, course
 * card, full-plan popup). Round numbered nodes on soft curves; the numbers
 * are the same ones the concept list and the transcript use (planLayout is
 * the single source of the order).
 */

/** The map's width cap in the chat column — about the side panel's scale,
 *  so the plan reads as a figure, not a poster. */
export const PLAN_MAP_CHAT_WIDTH = "max-w-[24rem]";

export interface PlanLayout {
	/** Node ids in reading order: layer by layer, left to right. */
	order: string[];
	/** 1-based concept number per node id. */
	number: Map<string, number>;
	/** Label characters per line that fit a node's row. */
	labelChars: Map<string, number>;
	pos: Map<string, { x: number; y: number }>;
	width: number;
	height: number;
}

const WIDTH = 300;
const LAYER_GAP = 76;
const TOP = 26;
const R = 13;

/** Layered layout. Each node sits as LATE as its dependents allow (one
 *  row above its earliest dependent), so a prerequisite stands right above
 *  what needs it instead of every root crowding the top row. Inside a row,
 *  nodes follow their neighbours' positions (fewer crossings), then the
 *  teacher's authoring order. */
export function planLayout(tree: PlanTree): PlanLayout {
	const ids = tree.nodes.map((n) => n.id);
	const known = new Set(ids);
	const preds = new Map(ids.map((id) => [id, [] as string[]]));
	const succs = new Map(ids.map((id) => [id, [] as string[]]));
	for (const e of tree.edges) {
		if (!known.has(e.from) || !known.has(e.to)) continue;
		preds.get(e.to)!.push(e.from);
		succs.get(e.from)!.push(e.to);
	}

	// Longest path down to a sink, then layer = depth - that height.
	const heightOf = new Map<string, number>();
	const visiting = new Set<string>();
	const height = (id: string): number => {
		const cached = heightOf.get(id);
		if (cached !== undefined) return cached;
		if (visiting.has(id)) return 0; // cycles can't come from plan_init; never recurse forever
		visiting.add(id);
		const h = Math.max(-1, ...succs.get(id)!.map(height)) + 1;
		visiting.delete(id);
		heightOf.set(id, h);
		return h;
	};
	ids.forEach(height);
	const depth = Math.max(0, ...heightOf.values());
	const layerOf = new Map(ids.map((id) => [id, depth - heightOf.get(id)!]));

	const layers: string[][] = [];
	for (const id of ids) (layers[layerOf.get(id)!] ??= []).push(id);
	const xIndex = new Map<string, number>();
	const authored = new Map(ids.map((id, i) => [id, i]));
	for (const row of layers) {
		const bary = (id: string) => {
			const p = preds.get(id)!.map((q) => xIndex.get(q)).filter((v): v is number => v !== undefined);
			return p.length ? p.reduce((a, b) => a + b, 0) / p.length : -1;
		};
		row.sort((a, b) => bary(a) - bary(b) || authored.get(a)! - authored.get(b)!);
		row.forEach((id, i) => xIndex.set(id, (i + 1) / (row.length + 1)));
	}

	const order = layers.flat();
	const pos = new Map<string, { x: number; y: number }>();
	layers.forEach((row, li) => row.forEach((id) => pos.set(id, { x: xIndex.get(id)! * WIDTH, y: TOP + li * LAYER_GAP })));
	const labelChars = new Map<string, number>();
	for (const row of layers) for (const id of row) labelChars.set(id, Math.max(8, Math.min(18, Math.floor(WIDTH / (row.length + 1) / 5.6))));
	return {
		order,
		number: new Map(order.map((id, i) => [id, i + 1])),
		labelChars,
		pos,
		width: WIDTH,
		height: TOP + Math.max(0, layers.length - 1) * LAYER_GAP + 40,
	};
}

/** Up to two short lines for a node label. */
function labelLines(title: string, max = 15): string[] {
	const words = title.split(/\s+/);
	const lines: string[] = [];
	let cur = "";
	for (const w of words) {
		if (!cur) cur = w;
		else if ((cur + " " + w).length <= max) cur += " " + w;
		else {
			lines.push(cur);
			cur = w;
		}
	}
	if (cur) lines.push(cur);
	if (lines.length > 2) lines.splice(2, lines.length - 2, lines[1]!.length > max - 1 ? lines[1]!.slice(0, max - 1) + "…" : lines[1]! + "…");
	return lines.map((l) => (l.length > max + 2 ? l.slice(0, max) + "…" : l));
}

export function PlanMap({
	tree,
	layout,
	progressOf,
	viewingId,
	onSelect,
	numbers,
	naturalSize = false,
}: {
	tree: PlanTree;
	/** Draw at the layout's own size (the popup scales it) instead of
	 *  filling the container's width. */
	naturalSize?: boolean;
	layout: PlanLayout;
	/** Concept numbers (conceptNumbers); the layout order when absent. */
	numbers?: Map<string, number>;
	progressOf: (id: string) => PlanNodeProgress;
	/** The concept the transcript is scrolled to (outlined). */
	viewingId: string | null;
	onSelect: (id: string) => void;
}) {
	const titles = new Map(tree.nodes.map((n) => [n.id, n.title]));
	return (
		<svg
			viewBox={`0 0 ${layout.width} ${layout.height}`}
			width={naturalSize ? layout.width : undefined}
			height={naturalSize ? layout.height : undefined}
			className={cn("block select-none", !naturalSize && "h-auto w-full")}
			role="img"
			aria-label="Plan map"
			style={{ fontFamily: "var(--font-ui)" }}
		>
			<defs>
				<filter id="plan-map-glow" x="-100%" y="-100%" width="300%" height="300%">
					<feGaussianBlur stdDeviation="5" />
				</filter>
			</defs>

			{tree.edges.map((e) => {
				const a = layout.pos.get(e.from);
				const b = layout.pos.get(e.to);
				if (!a || !b) return null;
				const y1 = a.y + R + 2;
				const y2 = b.y - R - 2;
				const mid = (y1 + y2) / 2;
				const lit = progressOf(e.from) === "done";
				return (
					<path
						key={`${e.from}->${e.to}`}
						d={`M ${a.x} ${y1} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${y2}`}
						fill="none"
						strokeWidth={1.5}
						strokeLinecap="round"
						className={cn("transition-colors duration-500", lit ? "stroke-foreground/45" : "stroke-border")}
					/>
				);
			})}

			{layout.order.map((id) => {
				const p = layout.pos.get(id)!;
				const progress = progressOf(id);
				const n = (numbers ?? layout.number).get(id)!;
				const viewing = viewingId === id;
				const lines = labelLines(titles.get(id) ?? id, layout.labelChars.get(id) ?? 15);
				return (
					<g
						key={id}
						data-testid={`plan-map-node-${id}`}
						transform={`translate(${p.x} ${p.y})`}
						className="cursor-pointer"
						onClick={() => onSelect(id)}
					>
						<title>{`${n}. ${titles.get(id) ?? id}`}</title>
						{progress === "current" && (
							<circle r={R + 4} className="fill-primary/60" filter="url(#plan-map-glow)">
								<animate attributeName="opacity" values="0.9;0.35;0.9" dur="2.4s" repeatCount="indefinite" />
							</circle>
						)}
						{viewing && <circle r={R + 4.5} fill="none" strokeWidth={1.5} className="stroke-foreground/70" />}
						<circle
							r={R}
							strokeWidth={1.5}
							className={cn(
								"transition-colors duration-500",
								progress === "done" && "fill-foreground stroke-foreground",
								progress === "current" && "fill-primary stroke-primary",
								progress === "taught" && "fill-card stroke-foreground/80",
								progress === "upcoming" && "fill-card stroke-border",
							)}
						/>
						{progress === "done" ? (
							<path d="M -4.5 0.5 L -1.5 3.5 L 4.5 -3" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="stroke-background" />
						) : (
							<text
								textAnchor="middle"
								dy="0.35em"
								fontSize={11}
								className={cn(
									"tabular-nums",
									progress === "current" ? "fill-primary-foreground font-medium" : progress === "taught" ? "fill-foreground" : "fill-muted-foreground",
								)}
							>
								{n}
							</text>
						)}
						{lines.map((line, i) => (
							<text
								key={i}
								textAnchor="middle"
								y={R + 13 + i * 11}
								fontSize={9.5}
								className={cn(progress === "upcoming" ? "fill-muted-foreground/80" : "fill-foreground", (progress === "current" || viewing) && "font-medium")}
							>
								{line}
							</text>
						))}
					</g>
				);
			})}
		</svg>
	);
}

type PartsMessage = { parts?: Array<{ type: string; state?: string; input?: unknown }> };

/**
 * Concept numbers as the learner experiences them: concepts already reached
 * are numbered in the order they were taught, the waiting "up next" concept
 * follows, then the rest in map reading order. The map, the list, the
 * transcript dividers and the recap cards all read these numbers.
 */
export function conceptNumbers(tree: PlanTree, layout: PlanLayout, messages: readonly PartsMessage[], upNext?: string | null): { order: string[]; number: Map<string, number> } {
	const ids = new Set(tree.nodes.map((n) => n.id));
	const order: string[] = [];
	const add = (id: unknown) => {
		if (typeof id === "string" && ids.has(id) && !order.includes(id)) order.push(id);
	};
	for (const m of messages) {
		for (const part of m.parts ?? []) {
			if (part.type === "tool-quiz" || part.type === "tool-explain" || (part.type === "tool-concept_done" && part.state === "output-available")) {
				add((part.input as { nodeId?: unknown } | undefined)?.nodeId);
			}
		}
	}
	add(upNext);
	for (const id of layout.order) add(id);
	return { order, number: new Map(order.map((id, i) => [id, i + 1])) };
}
