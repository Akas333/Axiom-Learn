import { useState } from "react";
import { CheckIcon, ChevronDownIcon, CompassIcon } from "lucide-react";
import type { PopupMessage } from "@/components/plan-block";
import { cn } from "@/lib/utils";

/**
 * The probe guide (2026-10-29): while the tutor is probing, the side panel
 * says why the session opens with questions instead of teaching — a first
 * session otherwise starts with an unexplained quiz. Its three steps follow
 * the probe live from the transcript: the goal (ask_user_question), the
 * knowledge checks (probe / recall), then the plan built from them. It
 * steps aside once the plan card has a plan to show.
 */

export type ProbeStep = "goal" | "knowledge" | "plan";

export interface ProbeProgress {
	step: ProbeStep;
	/** Answered goal questions (what it's for, how deep). */
	goalAnswers: number;
	/** Answered knowledge checks. */
	checks: number;
	/** The chat is one concept of a course: the goal came from the course. */
	inCourse: boolean;
	/** probe_done's advice, once it has landed. */
	recommendation?: "teach" | "practice";
}

const CHECK_TOOLS = new Set(["tool-probe", "tool-recall", "tool-quiz", "tool-explain"]);

/** Where the probe stands — the same seam as the phase fold: the probe
 *  ends at the first concluded probe_done. */
export function probeProgress(messages: readonly PopupMessage[]): ProbeProgress {
	let goalAnswers = 0;
	let checks = 0;
	let asked = false;
	let inCourse = false;
	for (const m of messages) {
		for (const part of m.parts) {
			if (part.type === "data-course-context") inCourse = true;
			else if (part.type === "tool-ask_user_question") {
				if (part.state === "output-available") goalAnswers++;
			} else if (CHECK_TOOLS.has(part.type)) {
				asked = true;
				if (part.state === "output-available") checks++;
			} else if (part.type === "tool-probe_done" && part.state === "output-available") {
				const recommendation = (part.input as { recommendation?: unknown } | undefined)?.recommendation;
				return {
					step: "plan",
					goalAnswers,
					checks,
					inCourse,
					recommendation: recommendation === "practice" ? "practice" : "teach",
				};
			}
		}
	}
	return { step: asked || inCourse ? "knowledge" : "goal", goalAnswers, checks, inCourse };
}

const COLLAPSED_KEY = "lh:probe-guide-collapsed";

function readCollapsed(): boolean {
	try {
		return window.localStorage.getItem(COLLAPSED_KEY) === "1";
	} catch {
		return false;
	}
}

const STEP_ORDER: readonly ProbeStep[] = ["goal", "knowledge", "plan"];

function count(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}

/** The side panel's probe card. */
export function ProbeGuideCard({ messages }: { messages: readonly PopupMessage[] }) {
	const [collapsed, setCollapsedState] = useState(readCollapsed);
	const setCollapsed = (next: boolean) => {
		setCollapsedState(next);
		try {
			window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
		} catch {
			/* storage unavailable: the choice lasts for this view */
		}
	};
	const progress = probeProgress(messages);
	const at = STEP_ORDER.indexOf(progress.step);

	const steps: Array<{ id: ProbeStep; title: string; detail: string }> = [
		{
			id: "goal",
			title: "Your goal",
			detail: progress.inCourse
				? "Carried over from the course plan — you won't be asked again."
				: progress.goalAnswers > 0
					? `What it's for and how deep you want to go · ${count(progress.goalAnswers, "answer", "answers")}`
					: "What it's for (an exam, a course, curiosity) and how deep you want to go.",
		},
		{
			id: "knowledge",
			title: "What you already know",
			detail:
				progress.checks > 0
					? `Quick checks on the ideas this builds on · ${count(progress.checks, "answer", "answers")}`
					: "Quick checks on the ideas this builds on. Right answers make the next one harder; misses make it easier.",
		},
		{
			id: "plan",
			title: "Your plan",
			detail:
				progress.recommendation === "practice"
					? "You already know this at your level — choose practice or a lesson in the chat."
					: progress.step === "plan"
						? "Being built from your answers now."
						: "Built from your answers, so lessons start where you are.",
		},
	];

	return (
		<section className="lh-panel-card" data-testid="probe-guide" aria-label="Why these questions">
			<header className="flex items-center gap-2">
				<CompassIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
				<button
					type="button"
					onClick={() => setCollapsed(!collapsed)}
					aria-expanded={!collapsed}
					className="-ml-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-sm font-medium text-foreground transition-colors hover:bg-(--pill)"
				>
					Why these questions?
					<ChevronDownIcon className={cn("size-3.5 text-muted-foreground transition-transform", collapsed && "-rotate-90")} />
				</button>
				<span className="ml-auto text-xs tabular-nums text-muted-foreground">Step {at + 1} of 3</span>
			</header>

			{!collapsed && (
				<div className="mt-2">
					<p className="text-sm text-foreground/90">
						Before teaching, your tutor finds out what this is for and what you already know — so the lesson
						starts where you are, instead of re-teaching what you have or skipping what you're missing.
					</p>

					<ol className="mt-3 flex flex-col gap-2.5">
						{steps.map((s, i) => {
							const state = i < at ? "done" : i === at ? "current" : "upcoming";
							return (
								<li key={s.id} data-testid={`probe-step-${s.id}`} data-state={state} className="flex items-start gap-3">
									{state === "done" ? (
										<span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
											<CheckIcon className="size-3" strokeWidth={3} aria-label="Done" />
										</span>
									) : (
										<span
											className={cn(
												"mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] tabular-nums",
												state === "current" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground",
											)}
										>
											{i + 1}
										</span>
									)}
									<div className="min-w-0 flex-1">
										{state === "current" && <div className="text-[11px] font-medium text-primary">Now</div>}
										<div className={cn("text-sm", state === "upcoming" ? "text-muted-foreground" : "text-foreground", state === "current" && "font-medium")}>
											{s.title}
										</div>
										<p className="mt-0.5 text-xs text-muted-foreground">{s.detail}</p>
									</div>
								</li>
							);
						})}
					</ol>
				</div>
			)}
		</section>
	);
}
