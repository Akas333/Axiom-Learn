import { useEffect } from "react";
import { ArrowRightIcon, CheckIcon, FlagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageResponse } from "@/components/ai-elements/message";

/** What the teacher wrote in the concept_done call. */
export interface ConceptDoneInputView {
	nodeId?: string;
	recap?: string[];
	nextNodeId?: string;
	nextHint?: string;
}

/** What the server resolved (titles from the live plan). */
export interface ConceptDoneOutputView {
	title?: string;
	nextTitle?: string | null;
}

/** The text the Continue button sends — also what the teacher reads. */
export function continueMessage(nextTitle: string): string {
	return `Continue to the next concept: ${nextTitle}`;
}

/**
 * The end-of-concept card: what the concept established (the recap), what
 * comes next and why, and the Continue button that starts it. Only the
 * latest card is live: once the learner continues (or a turn is running),
 * the button gives way to a quiet "continued" line.
 */
export function ConceptDoneCard({
	input,
	output,
	number,
	live,
	onContinue,
	courseNext,
}: {
	/** The concept's plan number (same as the sidebar and its opener). */
	number?: number;
	input: ConceptDoneInputView;
	output: ConceptDoneOutputView | undefined;
	/** True for the latest card while the session waits on the learner. */
	live: boolean;
	onContinue: (nextTitle: string) => void;
	/** In a course chat whose plan is finished: the course's next concept. */
	courseNext?: { title: string; onOpen: () => void } | null;
}) {
	const recap = (input.recap ?? []).filter((l) => l.trim());
	const title = output?.title ?? input.nodeId ?? "Concept";
	const nextTitle = output?.nextTitle ?? null;

	// Enter continues from anywhere on the page while the card is live
	// (typing surfaces keep their own Enter).
	useEffect(() => {
		if (!live || !nextTitle) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Enter" || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
			const t = e.target as HTMLElement | null;
			if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "BUTTON" || t.isContentEditable)) return;
			e.preventDefault();
			onContinue(nextTitle);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [live, nextTitle, onContinue]);

	return (
		<section
			data-testid="concept-done-card"
			className="my-4 overflow-hidden rounded-2xl border border-border bg-card"
			aria-label={`Concept complete: ${title}`}
		>
			<div className="flex items-center gap-3 px-5 pt-4">
				<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
					<CheckIcon className="size-4" strokeWidth={2.5} aria-hidden />
				</span>
				<div className="min-w-0">
					<div className="text-xs text-muted-foreground">{number ? `Concept ${number} complete` : "Concept complete"}</div>
					<div className="truncate text-lg font-medium text-foreground">{title}</div>
				</div>
			</div>

			{recap.length > 0 && (
				<div className="px-5 pt-3">
					<div className="pb-1.5 text-xs text-muted-foreground">Recap</div>
					<ul className="lh-prose space-y-1.5 text-foreground">
						{recap.map((line, i) => (
							<li key={i} className="flex gap-2.5">
								<span className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
								<div className="min-w-0 flex-1 [&_p]:m-0">
									<MessageResponse>{line}</MessageResponse>
								</div>
							</li>
						))}
					</ul>
				</div>
			)}

			<div className="mt-4 border-t border-border bg-background/40 px-5 py-4">
				{nextTitle ? (
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="min-w-0">
							<div className="text-xs text-muted-foreground">Up next</div>
							<div className="font-medium text-foreground">{nextTitle}</div>
							{input.nextHint && <p className="mt-0.5 text-sm text-muted-foreground">{input.nextHint}</p>}
						</div>
						{live ? (
							<Button data-testid="concept-continue" className="shrink-0" onClick={() => onContinue(nextTitle)}>
								Continue
								<ArrowRightIcon aria-hidden />
							</Button>
						) : (
							<span className="shrink-0 text-xs text-muted-foreground">Continued</span>
						)}
					</div>
				) : courseNext ? (
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="min-w-0">
							<div className="text-xs text-muted-foreground">Next in the course</div>
							<div className="font-medium text-foreground">{courseNext.title}</div>
							{input.nextHint && <p className="mt-0.5 text-sm text-muted-foreground">{input.nextHint}</p>}
						</div>
						<Button data-testid="course-next" className="shrink-0" onClick={courseNext.onOpen}>
							Next concept
							<ArrowRightIcon aria-hidden />
						</Button>
					</div>
				) : (
					<div className="flex items-center gap-2 text-sm text-foreground">
						<FlagIcon className="size-4 text-primary" aria-hidden />
						You've finished every concept in this plan.
					</div>
				)}
			</div>
		</section>
	);
}
