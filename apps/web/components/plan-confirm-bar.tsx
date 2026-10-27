import { CheckIcon, PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
			className="lh-card-enter my-4 ml-10 flex flex-wrap items-center gap-3 rounded-2xl border border-strong/70 bg-card px-4 py-3"
		>
			<div className="mr-auto min-w-0">
				<div className="text-sm font-semibold text-primary">Ready to start?</div>
				<div className="text-xs text-secondary">Confirm the plan, or tell the teacher what to change.</div>
			</div>
			<Button size="sm" variant="secondary" data-testid="plan-change" onClick={(e) => {
					blurAfterPointerClick(e);
					onChange();
				}}><PencilIcon className="size-4" />Change plan</Button>
			<Button size="sm" variant="primary" data-testid="plan-confirm" onClick={(e) => {
					blurAfterPointerClick(e);
					onConfirm();
				}}><CheckIcon className="size-4" />Confirm plan</Button>
		</div>
	);
}
