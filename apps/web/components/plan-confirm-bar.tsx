import { CheckIcon, PencilIcon } from "lucide-react";
import { blurAfterPointerClick } from "@/components/focus-hygiene";

/** What the Confirm button sends: the teacher starts the first concept on it. */
export const PLAN_CONFIRM_MESSAGE = "The plan looks good — let's start.";

/**
 * The end of a plan presentation: instead of a bare "confirm or request
 * changes" line, the learner gets two buttons. Confirm sends the go-ahead;
 * Change plan moves focus to the composer to say what to change.
 * Shown only while the plan is waiting on the learner (see chat.tsx).
 */
export function PlanConfirmBar({ onConfirm, onChange }: { onConfirm: () => void; onChange: () => void }) {
	return (
		<div
			data-testid="plan-confirm-bar"
			className="lh-card-enter my-4 ml-10 flex flex-wrap items-center gap-3 rounded-2xl border border-input/70 bg-card px-4 py-3"
		>
			<div className="mr-auto min-w-0">
				<div className="text-sm font-semibold text-foreground">Ready to start?</div>
				<div className="text-xs text-muted-foreground">Confirm the plan, or tell the teacher what to change.</div>
			</div>
			<button
				type="button"
				data-testid="plan-change"
				onClick={(e) => {
					blurAfterPointerClick(e);
					onChange();
				}}
				className="inline-flex h-9 items-center gap-1.5 rounded-full bg-(--pill) px-4 text-sm font-medium text-foreground transition-colors hover:bg-(--pill-hover) focus-visible:outline-2 focus-visible:outline-primary"
			>
				<PencilIcon className="size-3.5" />
				Change plan
			</button>
			<button
				type="button"
				data-testid="plan-confirm"
				onClick={(e) => {
					blurAfterPointerClick(e);
					onConfirm();
				}}
				className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
			>
				<CheckIcon className="size-4" />
				Confirm plan
			</button>
		</div>
	);
}
