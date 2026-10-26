
import { ArrowRightIcon, CircleStopIcon, CornerDownLeftIcon } from "lucide-react";
import { DictationButton, DictationMeter, type Dictation } from "@/components/dictation";
import { cn } from "@/lib/utils";

/**
 * The composer bar — ONE row inside a rounded pill: an optional leading
 * control, the text, then (while dictating) the dot meter, the ↵ send
 * button and the mic. The pill itself is COMPOSER_SHELL, applied by the
 * host (the chat view's shell also morphs into the question card, so it
 * lives outside this component). Home, new-session and chat all use it.
 *
 * Corner-radius math (concentric with the shell): shell rounded-3xl (24px)
 * − row padding p-2 (8px) ≈ button rounded-xl (12px).
 */
export const COMPOSER_SHELL = "rounded-3xl border border-input/70 bg-card shadow-lg";
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
	inputRef?: React.RefObject<HTMLTextAreaElement | null>;
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
	return (
		<form
			data-testid="composer"
			className="flex items-end gap-1 p-2"
			onSubmit={(e) => {
				e.preventDefault();
				act();
			}}
		>
			{leading ? <div className="flex shrink-0 items-center">{leading}</div> : null}
			<textarea
				ref={inputRef}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={(e) => {
					// Esc ends dictation; stopPropagation claims it so the
					// window-level chain doesn't also abort a turn.
					if (e.key === "Escape" && onEscape) {
						e.preventDefault();
						e.stopPropagation();
						onEscape();
						return;
					}
					// Enter sends, Shift+Enter is a newline, ⌘/Ctrl+Enter sends.
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
						e.preventDefault();
						act();
					}
				}}
				placeholder={placeholder}
				autoFocus={autoFocus}
				rows={1}
				className={cn(
					"field-sizing-content lh-input max-h-48 min-h-9 flex-1 resize-none bg-transparent py-2 outline-none placeholder:text-muted-foreground/70",
					leading ? "px-1.5" : "px-3",
				)}
			/>
			{dictation ? <DictationMeter dictation={dictation} /> : null}
			{/* The practice pause morphs the button into a wide green NEXT
			    PROBLEM on an empty composer (owner round 16); typing brings
			    the regular send back. While a turn runs with nothing typed the
			    button is Stop; with text it stays Send (a steer). */}
			{nextProblem && !busy && !canSend ? (
				<button
					type="submit"
					data-testid="next-problem-button"
					aria-label="Next problem"
					className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-green-600 px-4 font-ui text-xs font-medium text-white transition-colors hover:bg-green-500"
				>
					Next problem
					<ArrowRightIcon className="size-4" />
				</button>
			) : (
				<button
					type="submit"
					aria-label={stopMode ? "Stop" : "Send"}
					data-testid="composer-send"
					disabled={!busy && !canSend}
					className={cn(
						"flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
						stopMode || canSend
							? "text-foreground hover:bg-(--pill)"
							: "text-muted-foreground/50",
					)}
				>
					{stopMode ? <CircleStopIcon className="size-5" /> : <CornerDownLeftIcon className="size-5" />}
				</button>
			)}
			{dictation ? <DictationButton dictation={dictation} /> : null}
		</form>
	);
}
