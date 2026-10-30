
import { useContext, useState } from "react";
import { ClipboardCheckIcon, DumbbellIcon, GraduationCapIcon } from "lucide-react";
import { parseProbeDoneInput, type ProbeDoneResult } from "@/src/core";
import { ChatActionsContext } from "@/components/chat";

/** What Teach me anyway sends: the teacher plans from the probe on it. */
export const TEACH_ANYWAY_TEXT = "Teach me anyway — plan the lesson from where I am.";
/** What Switch to practice sends once the chat is a practice session. */
export const SWITCH_TO_PRACTICE_TEXT = "Switch to practice — give me problems at my level.";

/**
 * The probe conclusion card (docs/probe-teach-split.md §2): renders the
 * prober's probe_done call. The INPUT is the learner assessment — strand by
 * strand, where his edge sits — and it belongs to the learner as much as to
 * the transcript: it streams live while the prober writes it and stays as
 * the handoff artifact. The OUTPUT is the seam's ack (ok) or the refusal
 * the prober retried on (rendered quiet and small — it is model-facing
 * bookkeeping, kept only for transcript honesty).
 *
 * When the probe recommends practice (he already holds the concept at his
 * target level), the card offers the choice: Switch to practice flips this
 * chat in place; Teach me anyway sends the go-ahead to the teacher. The
 * buttons show only while that choice is still open.
 *
 * The input preview is only trustworthy while the call is pending — an
 * input-available input cleared schema validation at the boundary, and a
 * mid-stream partial is guarded below. An output-error part's input was
 * REJECTED by validation and can be any shape (live crash: the model
 * stringified `assessment`); never render it.
 */
export function ProbeDoneCard({ part }: { part: { input?: unknown; output?: unknown; state?: unknown } }) {
	const output = part.output as ProbeDoneResult | undefined;
	const state = typeof part.state === "string" ? part.state : "";
	const actions = useContext(ChatActionsContext);
	const [switching, setSwitching] = useState(false);
	const [switchError, setSwitchError] = useState<string | null>(null);

	// Parse, don't cast (the seam rule, src/core/tool-parts.ts): the model
	// authored this input — it is consumer-trustworthy only if the SAME
	// schema the tool declared says so. The parse subsumes the old state
	// reasoning and shape guards: an errored call's stringified assessment,
	// a mid-stream partial — anything that doesn't parse falls to the
	// fallback branch. Output stays a cast: OUR execute authored it.
	const input = parseProbeDoneInput(part.input);

	// The assessment is the CALL's input (owner, context diet 2026-10-09):
	// the result's echo is gone — details is {ok:true} only, and the refusal
	// branch below still reads output.error.
	const assessment = input?.assessment;
	const strands = assessment && Array.isArray(assessment.strands) ? assessment.strands : null;
	const goal = [input?.objective, input?.targetLevel].filter((s): s is string => Boolean(s?.trim()));
	const choiceOpen =
		state === "output-available" && output?.ok === true && input?.recommendation === "practice" && actions?.probeChoicePending === true;

	const switchToPractice = async () => {
		if (!actions) return;
		setSwitching(true);
		setSwitchError(null);
		try {
			await actions.switchToPractice();
		} catch (err) {
			console.error(err);
			setSwitchError("Couldn't switch this chat to practice — try again.");
		} finally {
			setSwitching(false);
		}
	};

	return (
		<div data-testid="probe-done-card" className="my-3 rounded-xl border bg-card/60 p-3">
			<div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
				<ClipboardCheckIcon className="size-3.5 text-primary" />
				Probe concluded — your assessment
			</div>
			{output && !output.ok ? (
				<p className="text-sm text-muted-foreground">The prober retried: {output.error}</p>
			) : state === "output-error" ? (
				<p className="text-sm text-muted-foreground">
					The assessment was malformed — the prober retried with a corrected one.
				</p>
			) : strands ? (
				<div className="space-y-2">
					{goal.length > 0 && <p className="px-1 text-sm font-medium text-foreground">{goal.join(" · ")}</p>}
					{strands.map((s, i) => (
						<div key={i} className="rounded-lg bg-background/60 px-3 py-2">
							<div className="text-sm font-medium">{s.strand}</div>
							<div className="mt-0.5 text-sm text-muted-foreground">{s.assessment}</div>
						</div>
					))}
					{assessment?.summary && (
						<p className="px-1 text-sm text-muted-foreground">{assessment.summary}</p>
					)}
				</div>
			) : (
				<p className="text-sm text-muted-foreground">Writing the assessment…</p>
			)}
			{choiceOpen && (
				<div
					data-testid="probe-practice-choice"
					className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3"
				>
					<div className="mr-auto min-w-0">
						<div className="text-sm font-semibold text-foreground">You already have this — switch to practice?</div>
						<div className="text-xs text-muted-foreground">{switchError ?? input?.reason}</div>
					</div>
					<button
						type="button"
						data-testid="probe-teach-anyway"
						disabled={switching}
						onClick={() => actions?.sendText(TEACH_ANYWAY_TEXT)}
						className="inline-flex h-9 items-center gap-1.5 rounded-full bg-(--pill) px-4 text-sm font-medium text-foreground transition-colors hover:bg-(--pill-hover) disabled:opacity-50"
					>
						<GraduationCapIcon className="size-3.5" />
						Teach me anyway
					</button>
					<button
						type="button"
						data-testid="probe-switch-practice"
						disabled={switching}
						onClick={() => void switchToPractice()}
						className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
					>
						<DumbbellIcon className="size-3.5" />
						{switching ? "Switching…" : "Switch to practice"}
					</button>
				</div>
			)}
		</div>
	);
}
