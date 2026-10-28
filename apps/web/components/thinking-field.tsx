import type { ReactNode } from "react";
import { Button } from "@astryxdesign/core/Button";
import { KeyboardIcon, MicIcon } from "lucide-react";
import { DictationControl, LevelDots, useDictationContext } from "@/components/dictation";
import { useHandsFreePref, useVoiceThinking } from "@/components/voice-thinking";
import { cn } from "@/lib/utils";

/**
 * The one look every "think out loud" field shares — thinking while
 * reading, thinking about an answer, working a practice problem, typing a
 * free answer: a rounded card with a quiet label, the text, and a footer
 * row (hint left; mic, meter and any action on the right). Same shape as
 * the composer pill, so the dock reads as one family.
 *
 * HANDS-FREE (voice-thinking.tsx): when this field is the one receiving
 * speech and the mic is listening on its own, the field invites talking
 * instead of typing — an accent border that brightens while the learner
 * speaks, a "Listening" status by the label, a live meter with the prompt
 * in the footer, and a "Type instead" button. After "Type instead" a
 * "Talk" button brings listening back.
 */
export const THINKING_TEXTAREA =
	"field-sizing-content lh-input max-h-48 w-full resize-none bg-transparent px-3 py-1 outline-none placeholder:text-secondary/70";

export function ThinkingField({
	label,
	testId,
	hint,
	mic = true,
	action,
	listeningPrompt = "Talk through your thinking — just start speaking",
	className,
	children,
}: {
	label: string;
	testId?: string;
	/** Quiet keyboard hint at the footer's left. */
	hint?: ReactNode;
	/** This field currently receives dictated speech (shows the mic, and
	 *  the hands-free listening state). */
	mic?: boolean;
	/** The footer's primary action (Submit). */
	action?: ReactNode;
	/** What the footer asks for while listening hands-free. */
	listeningPrompt?: string;
	className?: string;
	/** The textarea (style it with THINKING_TEXTAREA). */
	children: ReactNode;
}) {
	const dictation = useDictationContext();
	const voice = useVoiceThinking();
	const [handsFreeOn] = useHandsFreePref();
	const listening = mic && voice !== null && voice.listening;
	const speaking = listening && voice.status === "speaking";
	// Typed out of hands-free for this question: offer to talk again
	// (instead of the manual mic) while voice can still run here.
	const canTalkAgain =
		mic && voice !== null && voice.typedOut && handsFreeOn && voice.unavailable === null && !dictation?.active;
	const hasMic = mic && dictation !== null;
	const footer = listening || Boolean(hint) || hasMic || Boolean(action);
	return (
		<div
			data-testid={testId}
			data-listening={listening || undefined}
			className={cn(
				"rounded-lg border bg-card transition-[border-color,box-shadow] duration-200",
				listening
					? cn(
							"border-accent-bg/50 [&_textarea]:placeholder:text-transparent",
							speaking && "border-accent-bg shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-accent)_18%,transparent)]",
						)
					: "border-strong/70 focus-within:border-accent-bg/50",
				className,
			)}
		>
			<div className="flex items-center gap-2 px-3 pt-2.5 pb-0.5 text-xs font-medium text-secondary">
				<span>{label}</span>
				{listening && (
					<span className="flex items-center gap-1.5 text-primary" data-testid="voice-status">
						<span
							className={cn("size-1.5 rounded-full bg-current", speaking ? "animate-pulse" : "opacity-60")}
							aria-hidden
						/>
						{voice.status === "starting" ? "Starting mic…" : speaking ? "Hearing you" : "Listening"}
					</span>
				)}
			</div>
			{children}
			{footer ? (
				<div className="flex min-h-11 items-center gap-1 px-1.5 pb-1.5">
					{listening ? (
						<div className="flex min-w-0 flex-1 items-center gap-1 pl-1">
							<LevelDots
								levelRef={voice.levelRef}
								active={listening}
								count={12}
								className={speaking ? "text-primary" : "text-secondary/60"}
							/>
							<span className="min-w-0 truncate text-sm text-primary/80">
								{listeningPrompt}
							</span>
						</div>
					) : (
						<span aria-hidden className="min-w-0 flex-1 truncate pl-1.5 text-xs text-secondary">
							{hint}
						</span>
					)}
					{listening ? (
						<Button variant="ghost" size="sm" label="Type instead" icon={<KeyboardIcon className="size-4" />} className="shrink-0" onClick={voice.typeInstead} data-testid="voice-type-instead" />
					) : canTalkAgain ? (
						<Button variant="ghost" size="sm" label="Talk" icon={<MicIcon className="size-4" />} className="shrink-0" onClick={voice.listenAgain} data-testid="voice-talk" />
					) : (
						<DictationControl show={mic} />
					)}
					{action}
				</div>
			) : (
				<div className="pb-2" />
			)}
		</div>
	);
}
