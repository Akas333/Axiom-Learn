import { useContext, useEffect, useState } from "react";
import { ArrowRightIcon, BookOpenIcon, ChevronDownIcon, LightbulbIcon, MessageCircleQuestionIcon } from "lucide-react";
import type { ArtifactPartProps } from "@/src/core";
import { ToolContentResponse } from "@/components/ai-elements/message";
import { ChatActionsContext } from "@/components/chat";

/**
 * The textbook style's cards (2026-10-29): the section (the concept's full
 * textbook reading) and the illustration (a worked example — statement
 * first, then the solution revealed one step at a time, any step quotable
 * into the composer). Each pose ended the teacher's turn; the latest
 * card's Continue is the learner's go-ahead.
 */

/** What Continue sends after the section. */
export const SECTION_CONTINUE_TEXT = "I've read the section — continue.";
/** What Continue sends after an illustration. */
export const ILLUSTRATION_CONTINUE_TEXT = "Got it — continue.";

const PRIMARY_PILL =
	"inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90";
const QUIET_PILL =
	"inline-flex h-8 items-center gap-1.5 rounded-full bg-(--pill) px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-(--pill-hover)";

/** The waiting pose's Continue, repeated at the transcript's end once a
 *  delivered figure (and the tutor's reply to it) pushed the card up. */
export function TextbookContinueBar({
	tool,
	onContinue,
}: {
	tool: "section" | "illustration";
	onContinue: (text: string) => void;
}) {
	const section = tool === "section";
	return (
		<div
			data-testid="textbook-continue-bar"
			className="lh-card-enter my-4 ml-10 flex flex-wrap items-center gap-3 rounded-2xl border border-input/70 bg-card px-4 py-3"
		>
			<div className="mr-auto min-w-0 text-sm text-muted-foreground">
				{section ? "Done with the section above?" : "Done with the illustration above?"}
			</div>
			<button
				type="button"
				data-testid="textbook-continue"
				className={PRIMARY_PILL}
				onClick={() => onContinue(section ? SECTION_CONTINUE_TEXT : ILLUSTRATION_CONTINUE_TEXT)}
			>
				Continue
				<ArrowRightIcon className="size-4" />
			</button>
		</div>
	);
}

interface SectionView {
	title?: string;
	body?: string;
}

export function SectionCard({ part }: ArtifactPartProps) {
	const actions = useContext(ChatActionsContext);
	if (part.state === "output-error") return null;
	const input = (part.input ?? {}) as SectionView;
	const live = actions?.textbookWaitingOn === part.toolCallId;
	return (
		<section data-testid="section-card" className="lh-card-enter my-3 rounded-2xl border bg-card px-6 py-5">
			<div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
				<BookOpenIcon className="size-3.5 text-primary" />
				Textbook
			</div>
			{input.title && <h2 className="mb-3 text-xl font-semibold text-foreground">{input.title}</h2>}
			<div className="lh-prose text-[15px]">
				<ToolContentResponse>{typeof input.body === "string" ? input.body : ""}</ToolContentResponse>
			</div>
			{live && (
				<div className="mt-4 flex justify-end">
					<button type="button" data-testid="section-continue" className={PRIMARY_PILL} onClick={() => actions?.sendText(SECTION_CONTINUE_TEXT)}>
						Continue
						<ArrowRightIcon className="size-4" />
					</button>
				</div>
			)}
		</section>
	);
}

interface IllustrationView {
	title?: string;
	source?: string;
	difficulty?: string;
	statement?: string;
	steps?: unknown;
}

/** Revealed-step count, remembered per call so a reload keeps the place
 *  (a per-viewer convenience — absent storage just starts hidden). */
function useRevealed(callId: string, total: number): [number, (n: number) => void] {
	const key = `lh:illustration-revealed:${callId}`;
	const [revealed, setRevealed] = useState(() => {
		try {
			const n = Number(window.localStorage.getItem(key));
			return Number.isFinite(n) ? Math.min(Math.max(n, 0), total) : 0;
		} catch {
			return 0;
		}
	});
	useEffect(() => {
		try {
			window.localStorage.setItem(key, String(revealed));
		} catch {
			/* storage unavailable: the count lives for this view only */
		}
	}, [key, revealed]);
	return [revealed, setRevealed];
}

export function IllustrationCard({ part }: ArtifactPartProps) {
	const actions = useContext(ChatActionsContext);
	const input = (part.input ?? {}) as IllustrationView;
	const steps = Array.isArray(input.steps) ? input.steps.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
	const [revealed, setRevealed] = useRevealed(part.toolCallId, steps.length);
	if (part.state === "output-error") return null;
	const number = (part.output as { number?: number } | undefined)?.number;
	const name = number ? `Illustration ${number}` : "Illustration";
	const live = actions?.textbookWaitingOn === part.toolCallId;
	const allShown = revealed >= steps.length;

	return (
		<section data-testid="illustration-card" className="lh-card-enter my-3 rounded-2xl border bg-card px-5 py-4">
			<div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
				<LightbulbIcon className="size-3.5 text-primary" />
				{name}
				{input.difficulty === "tricky" && (
					<span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-500">Tricky</span>
				)}
			</div>
			{input.title && <h3 className="mb-1 text-base font-semibold text-foreground">{input.title}</h3>}
			{input.source && <p className="mb-2 text-xs text-muted-foreground">From {input.source}</p>}
			<div className="lh-prose text-[15px]">
				<ToolContentResponse>{typeof input.statement === "string" ? input.statement : ""}</ToolContentResponse>
			</div>
			{revealed > 0 && <div className="my-3 border-t" />}
			{steps.slice(0, revealed).map((step, i) => (
				<div key={i} data-testid="illustration-step" className="mb-3">
					<div className="mb-1 flex items-center justify-between gap-2">
						<span className="text-xs font-semibold text-foreground">Step {i + 1}</span>
						<button
							type="button"
							data-testid="illustration-ask"
							onClick={() => actions?.askAbout(`Step ${i + 1} of ${name}:\n${step}`)}
							className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							<MessageCircleQuestionIcon className="size-3.5" />
							Ask about this step
						</button>
					</div>
					<div className="lh-prose text-[15px]">
						<ToolContentResponse>{step}</ToolContentResponse>
					</div>
				</div>
			))}
			<div className="mt-3 flex justify-end gap-2">
				{!allShown && (
					<button
						type="button"
						data-testid="illustration-reveal"
						onClick={() => setRevealed(revealed + 1)}
						className={revealed === 0 ? PRIMARY_PILL : QUIET_PILL}
					>
						<ChevronDownIcon className="size-4" />
						{revealed === 0 ? "Show the first step" : `Show step ${revealed + 1} of ${steps.length}`}
					</button>
				)}
				{allShown && live && (
					<button type="button" data-testid="illustration-continue" className={PRIMARY_PILL} onClick={() => actions?.sendText(ILLUSTRATION_CONTINUE_TEXT)}>
						Continue
						<ArrowRightIcon className="size-4" />
					</button>
				)}
			</div>
		</section>
	);
}
