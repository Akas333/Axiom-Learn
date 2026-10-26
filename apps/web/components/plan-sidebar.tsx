import { useMemo, type ReactNode } from "react";
import { CheckIcon, Maximize2Icon, PanelRightCloseIcon } from "lucide-react";
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
		<aside
			data-testid="plan-sidebar"
			className="flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-background"
			aria-label="Lesson plan"
		>
			<header className="flex h-15 shrink-0 items-center gap-2 border-b border-border px-4">
				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium text-foreground">Plan</div>
					<div className="text-xs text-muted-foreground">
						{doneCount} of {tree.nodes.length} concepts done
					</div>
				</div>
				<IconButton label="Open the full map" onClick={onExpand}>
					<Maximize2Icon className="size-4" />
				</IconButton>
				<IconButton label="Hide the plan" onClick={onClose} testid="plan-sidebar-close">
					<PanelRightCloseIcon className="size-4" />
				</IconButton>
			</header>

			<div className="h-1 shrink-0 bg-border/60" aria-hidden>
				<div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${(doneCount / tree.nodes.length) * 100}%` }} />
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="border-b border-border px-3 pb-2 pt-4" data-testid="plan-sidebar-map">
					<PlanMap tree={tree} layout={layout} numbers={number} progressOf={progressOf} viewingId={viewingId} onSelect={onJump} />
				</div>

				<ol className="flex flex-col gap-1 p-3">
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
										"w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-accent/60",
										p === "current" && "bg-primary/10 ring-1 ring-primary/40 hover:bg-primary/15",
										viewing && p !== "current" && "bg-accent ring-1 ring-foreground/25",
									)}
								>
									<div className="flex items-start gap-3">
										<StepMarker progress={p} number={number.get(id)!} />
										<div className="min-w-0 flex-1">
											{(p === "current" || viewing) && (
												<div className={cn("text-[11px] font-medium", p === "current" ? "text-primary" : "text-muted-foreground")}>
													{p === "current" ? (waitingOnContinue ? "Up next" : "Now learning") : "Viewing"}
												</div>
											)}
											<div className={cn("text-sm", p === "upcoming" && !viewing ? "text-muted-foreground" : "text-foreground", p === "current" && "font-medium")}>
												{node.title}
											</div>
											{p === "current" && node.summary && <p className="mt-0.5 text-xs text-muted-foreground">{node.summary}</p>}
											{p === "done" && recap && recap.length > 0 && (
												<ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
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
		</aside>
	);
}

function IconButton({ label, onClick, testid, children }: { label: string; onClick: () => void; testid?: string; children: ReactNode }) {
	return (
		<Hint label={label} side="bottom">
			<button
				type="button"
				data-testid={testid}
				onClick={onClick}
				aria-label={label}
				className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				{children}
			</button>
		</Hint>
	);
}

/** Same marker language as the map: green check when done, filled blue
 *  number when current, outlined number otherwise. */
function StepMarker({ progress, number }: { progress: PlanNodeProgress; number: number }) {
	if (progress === "done") {
		return (
			<span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-400">
				<CheckIcon className="size-3" strokeWidth={3} aria-label={`${number}, done`} />
			</span>
		);
	}
	return (
		<span
			className={cn(
				"mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] tabular-nums",
				progress === "current" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground",
			)}
		>
			{number}
		</span>
	);
}
