import { NotebookPenIcon } from "lucide-react";
import { derivePlanStatuses, nodeProgress } from "@/src/core";
import type { PlanTree } from "@/src/core";
import { blurAfterPointerClick } from "@/components/focus-hygiene";

/** What the Summarize button sends. The teacher reads it and writes the note. */
export const SUMMARY_MESSAGE =
	"Summarize this session for me: write a short note of everything we've learned and taught here so far — " +
	"the key ideas of each concept we covered, how they connect, and anything I got wrong along the way. " +
	"Keep it brief and easy to review later, and write it in the same language we've been using.";

type TextParts = { role: string; parts: ReadonlyArray<{ type: string; text?: string }> };

/** Index of the last summary request in the transcript, or -1. */
export function lastSummaryRequest(messages: readonly TextParts[]): number {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m?.role === "user" && m.parts.some((p) => p.type === "text" && p.text?.trim() === SUMMARY_MESSAGE)) return i;
	}
	return -1;
}

/** True once every concept in the plan is done. */
export function planComplete(tree: PlanTree | null | undefined, messages: readonly unknown[]): boolean {
	if (!tree || tree.nodes.length === 0) return false;
	const statuses = derivePlanStatuses(tree, messages as Parameters<typeof derivePlanStatuses>[1]);
	return tree.nodes.every((n) => nodeProgress(statuses, n.id) === "done");
}

/**
 * Shown at the end of the transcript once every concept is done: asks the
 * learner whether they want a short summary note of the session.
 */
export function SummaryOfferBar({ onSummarize, onDismiss }: { onSummarize: () => void; onDismiss: () => void }) {
	return (
		<div
			data-testid="summary-offer-bar"
			className="lh-card-enter my-4 ml-10 flex flex-wrap items-center gap-3 rounded-2xl border border-input/70 bg-card px-4 py-3"
		>
			<div className="mr-auto min-w-0">
				<div className="text-sm font-semibold text-foreground">You've finished every concept 🎉</div>
				<div className="text-xs text-muted-foreground">Want a short summary note of everything you learned here?</div>
			</div>
			<button
				type="button"
				data-testid="summary-dismiss"
				onClick={(e) => {
					blurAfterPointerClick(e);
					onDismiss();
				}}
				className="inline-flex h-9 items-center gap-1.5 rounded-full bg-(--pill) px-4 text-sm font-medium text-foreground transition-colors hover:bg-(--pill-hover) focus-visible:outline-2 focus-visible:outline-primary"
			>
				No thanks
			</button>
			<button
				type="button"
				data-testid="summary-accept"
				onClick={(e) => {
					blurAfterPointerClick(e);
					onSummarize();
				}}
				className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
			>
				<NotebookPenIcon className="size-4" />
				Summarize
			</button>
		</div>
	);
}
