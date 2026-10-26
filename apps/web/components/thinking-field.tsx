import type { ReactNode } from "react";
import { DictationControl, useDictationContext } from "@/components/dictation";
import { cn } from "@/lib/utils";

/**
 * The one look every "think out loud" field shares — thinking while
 * reading, thinking about an answer, working a practice problem, typing a
 * free answer: a rounded card with a quiet label, the text, and a footer
 * row (hint left; mic, meter and any action on the right). Same shape as
 * the composer pill, so the dock reads as one family.
 */
export const THINKING_TEXTAREA =
	"field-sizing-content lh-input max-h-48 w-full resize-none bg-transparent px-3 py-1 outline-none placeholder:text-muted-foreground/70";

export function ThinkingField({
	label,
	testId,
	hint,
	mic = true,
	action,
	className,
	children,
}: {
	label: string;
	testId?: string;
	/** Quiet keyboard hint at the footer's left. */
	hint?: ReactNode;
	/** Show the dictation mic + meter (only the field that currently
	 *  receives dictated speech should). */
	mic?: boolean;
	/** The footer's primary action (Submit). */
	action?: ReactNode;
	className?: string;
	/** The textarea (style it with THINKING_TEXTAREA). */
	children: ReactNode;
}) {
	const dictation = useDictationContext();
	const hasMic = mic && dictation !== null;
	const footer = Boolean(hint) || hasMic || Boolean(action);
	return (
		<div
			data-testid={testId}
			className={cn(
				"rounded-2xl border border-input/70 bg-card transition-colors focus-within:border-primary/50",
				className,
			)}
		>
			<div className="px-3 pt-2.5 pb-0.5 text-xs font-medium text-muted-foreground">{label}</div>
			{children}
			{footer ? (
				<div className="flex min-h-11 items-center gap-1 px-1.5 pb-1.5">
					<span aria-hidden className="min-w-0 flex-1 truncate pl-1.5 text-xs text-muted-foreground">
						{hint}
					</span>
					<DictationControl show={mic} />
					{action}
				</div>
			) : (
				<div className="pb-2" />
			)}
		</div>
	);
}
