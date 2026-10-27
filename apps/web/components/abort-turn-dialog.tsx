
import { useEffect, useState } from "react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";

/**
 * The ESC-abort guard (owner, 2026-10-02): the global Esc → abort chain
 * opens this confirm popup EVERYWHERE — mid-stream aborts and pending-
 * question dismissals alike. Esc on the popup itself cancels (claimed —
 * it must never chain into another abort), which is also why Chat's
 * abort handler ignores events while this dialog is open: two window
 * listeners fire per Esc and stopPropagation alone cannot order them.
 *
 * An Astryx AlertDialog: title, one line, Cancel + destructive action.
 * No busy state — both actions are local.
 *
 * What "abort" means is mode-dependent: from a running turn it kills
 * the turn (partial stays); from a pending question there is no turn to
 * kill — abort IS dismissal (A2, 2026-10-03): the silent route writes
 * the skipped toolResult and wakes NOTHING; the session pauses until
 * the user's next plain message, which carries the dismissal to the
 * model in its context.
 */

/** What Esc is aborting — drives copy and the confirm action. */
export type AbortMode = "turn" | "question" | "problem";

const COPY: Record<AbortMode, { title: string; line: string; action: string }> = {
	turn: {
		title: "Abort this turn?",
		line: "The partial answer stays in the transcript.",
		action: "Abort",
	},
	question: {
		title: "Dismiss this question?",
		line: "Skipped — the teacher moves on without it.",
		action: "Dismiss",
	},
	problem: {
		title: "Discard this problem?",
		line: "The problem is dropped — no solution is revealed.",
		action: "Discard",
	},
};

export function AbortTurnDialog({
	mode,
	onClose,
	onConfirm,
	busy = false,
}: {
	/** What Esc is aborting; null = closed (nothing rendered). */
	mode: AbortMode | null;
	onClose: () => void;
	onConfirm: (mode: AbortMode) => void;
	busy?: boolean;
}) {
	// Esc cancels the popup and is claimed at the document level, so the
	// global Esc → abort listener never also fires.
	useEffect(() => {
		if (mode === null) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [mode, onClose]);

	// Keep the last mode's copy while the dialog animates closed.
	const [shown, setShown] = useState<AbortMode>(mode ?? "turn");
	useEffect(() => {
		if (mode !== null) setShown(mode);
	}, [mode]);
	const copy = COPY[shown];
	return (
		<AlertDialog
			isOpen={mode !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title={copy.title}
			description={copy.line + (busy && shown !== "turn" ? " The working turn stops too." : "")}
			actionLabel={copy.action}
			onAction={() => onConfirm(shown)}
			data-testid="abort-turn-dialog"
		/>
	);
}
