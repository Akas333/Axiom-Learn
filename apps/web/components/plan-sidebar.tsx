import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ActivitySection } from "@/components/activity-dock";
import { CheckIcon, ChevronDownIcon, Maximize2Icon, PanelRightCloseIcon } from "lucide-react";
import { derivePlanStatuses, nodeProgress, type PlanNodeProgress } from "@/src/core";
import { latestTree, type PopupMessage } from "@/components/plan-block";
import { conceptNumbers, PlanMap, planLayout } from "@/components/plan-map";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

/** The latest recap per node, from the concept_done cards in the transcript. */
function recapsByNode(messages: readonly PopupMessage[]): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const m of messages) {
		for (const part of (m as { parts?: Array<{ type: string; state?: string; input?: unknown }> }).parts ?? []) {
			if (part.type !== "tool-concept_done" || part.state !== "output-available") continue;
			const input = part.input as { nodeId?: string; recap?: string[] } | undefined;
			if (input?.nodeId && Array.isArray(input.recap)) out.set(input.nodeId, input.recap.filter((l) => l.trim()));
		}
	}
	return out;
}

/** Has any check been tagged with this node yet? */
function taught(messages: readonly PopupMessage[], nodeId: string): boolean {
	return messages.some((m) =>
		((m as { parts?: Array<{ type: string; input?: unknown }> }).parts ?? []).some(
			(part) =>
				(part.type === "tool-quiz" || part.type === "tool-explain") &&
				(part.input as { nodeId?: unknown } | undefined)?.nodeId === nodeId,
		),
	);
}

/** Recap lines are markdown; the compact list shows them as plain text. */
function plainText(md: string): string {
	return md
		.replace(/\$\$?([^$]+)\$\$?/g, "$1")
		.replace(/(\*\*|__)(.+?)\1/g, "$2")
		.replace(/(\*|_)(.+?)\1/g, "$2")
		.replace(/`([^`]+)`/g, "$1");
}

/**
 * The plan, docked at the right of the session: progress, the map, and the
 * concepts in the same numbered order with their recaps. Everything derives
 * from the transcript on each render, so it moves the moment a check is
 * tagged or a concept is closed. `viewingId` is the concept the transcript
 * is scrolled to; clicking a concept jumps there.
 */
export function PlanSidebar({
	messages,
	viewingId,
	onJump,
	onClose,
	onExpand,
}: {
	messages: readonly PopupMessage[];
	viewingId: string | null;
	onJump: (nodeId: string) => void;
	onClose: () => void;
	onExpand: () => void;
}) {
	// Below 1280px the panel floats over the session (backdrop, Esc closes)
	// instead of taking a column the transcript can't spare.
	const [overlay, setOverlay] = useState(() => typeof window !== "undefined" && window.matchMedia(OVERLAY_QUERY).matches);
	useEffect(() => {
		const mq = window.matchMedia(OVERLAY_QUERY);
		const on = () => setOverlay(mq.matches);
		mq.addEventListener("change", on);
		return () => mq.removeEventListener("change", on);
	}, []);
	useEffect(() => {
		if (!overlay) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [overlay, onClose]);

	return (
		<>
			{overlay && <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />}
			<aside
				data-testid="plan-sidebar"
				aria-label="Session panel"
				className={cn(
					"flex shrink-0 flex-col bg-body",
					overlay
						? "fixed inset-y-0 right-0 z-50 w-[min(22rem,calc(100vw-3rem))] border-l border-border pt-(--safe-top) pr-(--safe-right) pb-(--safe-bottom) shadow-2xl"
						: "h-full w-[22rem]",
				)}
			>
				{/* Inline, the top bar's toggle closes the panel; as a slide-over
				    that toggle sits under the backdrop, so the panel brings its own. */}
				{overlay && (
					<div className="flex h-15 shrink-0 items-center justify-end px-3">
						<IconButton label="Hide the side panel" onClick={onClose} testid="plan-sidebar-close">
							<PanelRightCloseIcon className="size-4" />
						</IconButton>
					</div>
				)}
				<div className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3", !overlay && "pt-3")}>
					<PlanCard messages={messages} viewingId={viewingId} onJump={onJump} onExpand={onExpand} />
					<ActivitySection variant="card" />
				</div>
			</aside>
		</>
	);
}

const OVERLAY_QUERY = "(max-width: 1279px)";

/** The Plan card: progress, the map, and the concepts in order with their
 *  recaps. Collapsible from its header. Renders nothing before a plan. */
function PlanCard({
	messages,
	viewingId,
	onJump,
	onExpand,
}: {
	messages: readonly PopupMessage[];
	viewingId: string | null;
	onJump: (nodeId: string) => void;
	onExpand: () => void;
}) {
	const [collapsed, setCollapsed] = useState(false);
	const tree = useMemo(() => latestTree(messages), [messages]);
	const statuses = useMemo(
		() => (tree ? derivePlanStatuses(tree, messages as Parameters<typeof derivePlanStatuses>[1]) : null),
		[tree, messages],
	);
	const recaps = useMemo(() => recapsByNode(messages), [messages]);
	const layout = useMemo(() => (tree ? planLayout(tree) : null), [tree]);
	if (!tree || !layout || tree.nodes.length === 0) return null;

	const byId = new Map(tree.nodes.map((n) => [n.id, n]));
	const progressOf = (id: string): PlanNodeProgress => (statuses ? nodeProgress(statuses, id) : "upcoming");
	const doneCount = tree.nodes.filter((n) => progressOf(n.id) === "done").length;
	// Right after a concept_done the current node waits on Continue: nothing
	// has been taught (tagged) on it yet.
	const waitingOnContinue = doneCount > 0 && !!statuses?.current && !taught(messages, statuses.current);
	const { order, number } = conceptNumbers(tree, layout, messages as Parameters<typeof conceptNumbers>[2], statuses?.current);

	return (
		<section className="lh-panel-card" data-testid="plan-card" aria-label="Lesson plan">
			<header className="flex items-center gap-2">
				<button
					type="button"
					onClick={() => setCollapsed((v) => !v)}
					aria-expanded={!collapsed}
					className="-ml-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-sm font-medium text-primary transition-colors hover:bg-overlay-hover"
				>
					Plan
					<ChevronDownIcon className={cn("size-3.5 text-secondary transition-transform", collapsed && "-rotate-90")} />
				</button>
				<span className="ml-auto text-xs tabular-nums text-secondary">
					{doneCount} / {tree.nodes.length} done
				</span>
				<IconButton label="Open the full map" onClick={onExpand}>
					<Maximize2Icon className="size-3.5" />
				</IconButton>
			</header>

			<div className="mt-2 h-1 overflow-hidden rounded-full bg-border/60" aria-hidden>
				<div className="h-full rounded-full bg-accent-bg transition-[width] duration-500" style={{ width: `${(doneCount / tree.nodes.length) * 100}%` }} />
			</div>

			{!collapsed && (
			<div className="mt-1">
				<div className="-mx-1 border-b border-border/60 pb-2 pt-3" data-testid="plan-sidebar-map">
					<PlanMap tree={tree} layout={layout} numbers={number} progressOf={progressOf} viewingId={viewingId} onSelect={onJump} />
				</div>

				<ol className="-mx-2 flex flex-col gap-1 pt-2">
					{order.map((id) => {
						const node = byId.get(id)!;
						const p = progressOf(id);
						const recap = recaps.get(id);
						const viewing = viewingId === id;
						return (
							<li key={id}>
								<button
									type="button"
									data-testid={`plan-step-${id}`}
									data-progress={p}
									data-viewing={viewing || undefined}
									onClick={() => onJump(id)}
									className={cn(
										"w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-overlay-hover",
										(p === "current" || viewing) && "bg-overlay-hover",
									)}
								>
									<div className="flex items-start gap-3">
										<StepMarker progress={p} number={number.get(id)!} />
										<div className="min-w-0 flex-1">
											{(p === "current" || viewing) && (
												<div className={cn("text-[11px] font-medium", p === "current" ? "text-accent" : "text-secondary")}>
													{p === "current" ? (waitingOnContinue ? "Up next" : "Now learning") : "Viewing"}
												</div>
											)}
											<div className={cn("text-sm", p === "upcoming" && !viewing ? "text-secondary" : "text-primary", p === "current" && "font-medium")}>
												{node.title}
											</div>
											{p === "current" && node.summary && <p className="mt-0.5 text-xs text-secondary">{node.summary}</p>}
											{p === "done" && recap && recap.length > 0 && (
												<ul className="mt-1 space-y-0.5 text-xs text-secondary">
													{recap.map((line, li) => (
														<li key={li} className="line-clamp-2">
															{plainText(line)}
														</li>
													))}
												</ul>
											)}
										</div>
									</div>
								</button>
							</li>
						);
					})}
				</ol>
			</div>
			)}
		</section>
	);
}

function IconButton({ label, onClick, testid, children }: { label: string; onClick: () => void; testid?: string; children: ReactNode }) {
	return (
		<Hint label={label} side="bottom">
			<Button size="sm" variant="ghost" data-testid={testid} onClick={onClick} aria-label={label}>{children}</Button>
		</Hint>
	);
}

/** Same marker language as the map: solid white check when done, filled blue
 *  number when current, outlined number otherwise. */
function StepMarker({ progress, number }: { progress: PlanNodeProgress; number: number }) {
	if (progress === "done") {
		return (
			<span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-inverted text-body">
				<CheckIcon className="size-3" strokeWidth={3} aria-label={`${number}, done`} />
			</span>
		);
	}
	return (
		<span
			className={cn(
				"mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] tabular-nums",
				progress === "current" ? "bg-accent-bg text-on-accent" : "border border-border text-secondary",
			)}
		>
			{number}
		</span>
	);
}
