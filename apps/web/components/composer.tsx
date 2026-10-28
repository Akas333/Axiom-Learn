
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { ChatComposer } from "@astryxdesign/core/Chat";
import { ArrowRightIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { DictationButton, DictationMeter, type Dictation } from "@/components/dictation";

/**
 * The composer: Astryx ChatComposer (Enter sends, Shift+Enter is a
 * newline, Stop while a turn runs). The mic + level meter sit beside
 * send; practice's between-problems pause swaps send for Next problem.
 * Home, new-session and chat all use it, inside COMPOSER_SHELL.
 */
/** The frame for the docks that take the composer's place (question,
 *  practice). The composer itself is Astryx ChatComposer's own surface. */
export const COMPOSER_SHELL = "rounded-lg bg-card shadow-md";
/** What one Enter press does, in precedence order: stop a busy stream,
 *  otherwise send the message, otherwise — practice sessions only — fire
 *  the next-problem signal while the between-problems pause is live
 *  (owner round 16: Enter on an EMPTY composer is the go-ahead; typing
 *  anything makes Enter a send again). Pure so the static-render harness
 *  can pin the decision (key events can't be simulated in
 *  renderToStaticMarkup). */
export function enterAction(state: {
	busy: boolean;
	canSend: boolean;
	/** The between-problems pause is live: practice session, nothing
	 *  active, no turn/compaction in flight (the caller's fold). */
	nextProblem?: boolean;
}): "stop" | "send" | "next" | "none" {
	// Composer steering (owner arc 2026-10-03): while a turn runs, typed
	// text makes Enter a STEER (the queue-and-redirect send); Enter with
	// an empty composer stays the stop shortcut. The button itself keeps
	// the square — Stop stays one click away at all times.
	if (state.busy) return state.canSend ? "send" : "stop";
	if (state.canSend) return "send";
	if (state.nextProblem) return "next";
	return "none";
}

export function Composer({
	busy,
	value,
	onChange,
	onSend,
	onStop,
	canSend,
	autoFocus,
	inputRef,
	onEscape,
	placeholder = "Ask, answer, or steer the lesson…",
	nextProblem = false,
	onNext,
	leading,
	dictation,
}: {
	busy: boolean;
	value: string;
	onChange: (v: string) => void;
	onSend: () => void;
	onStop: () => void;
	canSend: boolean;
	autoFocus?: boolean;
	/** The page's handle to the textarea — the dictation-end focus (owner,
	 *  2026-10-01): a run ending hands the cursor to the bare composer. */
	inputRef?: React.RefObject<HTMLElement | null>;
	/** Escape while a dictation runs stops it. No-op when absent. */
	onEscape?: () => void;
	placeholder?: string;
	/** The practice pause is live (owner round 16): Enter on the empty
	 *  composer fires the next-problem signal instead of doing nothing. */
	nextProblem?: boolean;
	/** The signal's dispatcher (send({type:"next"})). */
	onNext?: () => void;
	/** A control before the text (the draft's "+ pick nodes"). */
	leading?: React.ReactNode;
	/** The page's dictation engine: adds the meter + mic to the row. */
	dictation?: Dictation;
}) {
	const act = () => {
		const action = enterAction({ busy, canSend, nextProblem });
		if (action === "stop") onStop();
		else if (action === "send") onSend();
		else if (action === "next") onNext?.();
	};
	const stopMode = busy && !canSend;
	// The host's handle to the editor (dictation-end focus): point it at
	// the ChatComposer's own textarea.
	const rootRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = rootRef.current?.querySelector<HTMLElement>('[role="textbox"], textarea') ?? null;
		if (inputRef) (inputRef as React.MutableRefObject<HTMLElement | null>).current = el;
		if (autoFocus) el?.focus();
	}, [inputRef, autoFocus]);
	return (
		<div
			ref={rootRef}
			data-testid="composer"
			className="lh-input"
			// Esc while dictating stops it, and is claimed so the window chain
			// (abort turn) never also reads it.
			onKeyDownCapture={(e) => {
				if (e.key === "Escape" && onEscape) {
					e.preventDefault();
					e.stopPropagation();
					onEscape();
				}
			}}
		>
			<ChatComposer
				value={value}
				onChange={onChange}
				onSubmit={() => act()}
				onStop={onStop}
				isStopShown={stopMode}
				placeholder={placeholder}
				headerActions={leading}
				sendActions={
					dictation ? (
						<>
							<DictationMeter dictation={dictation} />
							<DictationButton dictation={dictation} />
						</>
					) : undefined
				}
				sendButton={
					// The practice pause: an empty composer's send becomes Next problem.
					nextProblem && !busy && !canSend ? (
						<Button
							data-testid="next-problem-button"
							variant="primary"
							label="Next problem"
							endContent={<Icon icon={ArrowRightIcon} />}
							onClick={() => onNext?.()}
						/>
					) : undefined
				}
			/>
		</div>
	);
}
