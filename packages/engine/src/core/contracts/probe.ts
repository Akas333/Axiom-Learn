/**
 * Probe-phase contracts (the probe→teach split, docs/probe-teach-split.md).
 *
 * The prober concludes its phase with `probe_done` — a server-side tool
 * whose INPUT is the learner assessment (authored by the model, streamed to
 * the learner live, durable in the transcript by the tool result itself).
 * The first `probe_done` in the transcript is the probe→planning seam: the
 * teacher agent is constructed from that point on, and the tool's execute
 * queues the handoff steer through the wake pipeline so the teacher starts
 * immediately after the prober's turn ends (auto-wake, user-decided).
 *
 * Assessment shape (v1 — refine later): the probe was a binary search per
 * dependency strand; the assessment formalizes exactly that. A list of the
 * strands the lesson will depend on, each with a free-form read of where
 * the learner's edge sits.
 */

import { Type, type Static } from "typebox";

/** One dependency strand the planned lesson will rest on. */
export interface ProbeStrand {
	/** Name/description of the strand (e.g. "the derivative as a limit"). */
	strand: string;
	/** Free-form: where the learner's edge sits on this strand — floor,
	 *  ceiling, misconceptions found, what to build from. */
	assessment: string;
}

/** The prober's read of the learner, carried by probe_done. */
export interface ProbeAssessment {
	strands: ProbeStrand[];
	/** Optional overall synthesis: the learner's apparent goal and edge. */
	summary?: string;
}

/** How much the goal spans: one concept (this chat teaches it) or several
 *  (this chat plans a course; each concept gets its own chat). */
export type ProbeScope = "concept" | "course";

/** What the probe advises: teach it, or skip to practice because he
 *  already holds it at the level he asked for. */
export type ProbeRecommendation = "teach" | "practice";

/** probe_done tool input (the assessment the prober authors). The fields
 *  beside `assessment` (2026-10-29) are OPTIONAL in the schema so probes
 *  recorded before them still parse for display; the tool's execute
 *  requires them on every new call (probeDoneMissingFields). */
export interface ProbeDoneInput {
	assessment: ProbeAssessment;
	/** Why he is learning this, in his words (exam, course, curiosity…). */
	objective?: string;
	/** The level he wants to reach (e.g. "JEE Advanced", "first-year undergrad"). */
	targetLevel?: string;
	scope?: ProbeScope;
	recommendation?: ProbeRecommendation;
	/** One sentence the learner sees: why this recommendation. */
	reason?: string;
}

// The TypeBox schema of that input — SINGLE SOURCE OF TRUTH, lived by the
// tool (src/agent/tools/probe.ts) and by the UI parse seam (src/core/tool-parts.ts):
// the boundary validation and the consumer parse run literally the same
// schema, so "schema-valid at the boundary" ⇔ "parseable by a consumer" is
// structural, not a convention. (Live crash 2026-09-12: the model sent
// `assessment` as a STRING; the card cast it and died on `.strands.map`.)
export const probeDoneInputSchema = Type.Object({
	assessment: Type.Object(
		{
			strands: Type.Array(
				Type.Object({
					strand: Type.String({
						description:
							"The dependency strand (e.g. 'the derivative as a limit') — a name the plan can hang a node on.",
					}),
					assessment: Type.String({
						description:
							"Where his edge sits on this strand: the floor (what he reliably gets right), the ceiling (where it runs out), " +
							"misconceptions found, and what the lesson should build from.",
					}),
				}),
				{ minItems: 1, description: "Every strand the planned lesson will depend on, each with your read of his edge on it." },
			),
			summary: Type.Optional(
				Type.String({
					description: "Optional overall synthesis: his apparent goal and where the teaching should enter.",
				}),
			),
		},
		{ description: "The learner assessment — the probe's distilled output." },
	),
	objective: Type.Optional(
		Type.String({
			description: "REQUIRED — why he is learning this, as he told you (an exam, a course, a project, curiosity).",
		}),
	),
	targetLevel: Type.Optional(
		Type.String({
			description: "REQUIRED — the level he wants to reach, as he told you (e.g. 'JEE Advanced', 'first-year undergrad').",
		}),
	),
	scope: Type.Optional(
		Type.Union([Type.Literal("concept"), Type.Literal("course")], {
			description:
				"REQUIRED — concept: the goal is one concept this chat will teach. course: the goal spans several concepts " +
				"(a chapter, a topic) — this chat plans a course and each concept gets its own chat. Bare word, no quotes.",
		}),
	),
	recommendation: Type.Optional(
		Type.Union([Type.Literal("teach"), Type.Literal("practice")], {
			description:
				"REQUIRED — practice only when every strand already clears his target level, so teaching would re-teach what he holds; " +
				"otherwise teach. Bare word, no quotes.",
		}),
	),
	reason: Type.Optional(
		Type.String({
			description: "REQUIRED — one plain sentence to the learner explaining the recommendation.",
		}),
	),
});

/** The fields a NEW probe_done must carry (schema-optional only so older
 *  probes still parse). Returns the missing field names. */
export function probeDoneMissingFields(input: ProbeDoneInput): string[] {
	const missing: string[] = [];
	if (!input.objective?.trim()) missing.push("objective");
	if (!input.targetLevel?.trim()) missing.push("targetLevel");
	if (!input.scope) missing.push("scope");
	if (!input.recommendation) missing.push("recommendation");
	if (!input.reason?.trim()) missing.push("reason");
	return missing;
}

/** Schema ↔ interface lock (the old `satisfies z.ZodType` guarantee): the
 *  declaration and ProbeDoneInput can never drift apart — this only compiles
 *  when the schema's static shape IS the interface. */
export const probeDoneSchemaLock = (v: Static<typeof probeDoneInputSchema>): ProbeDoneInput => v;

/** probe_done tool output. */
export interface ProbeDoneResult {
	ok: boolean;
	/** Refusal reason when ok === false (open question, already concluded). */
	error?: string;
}

/** The probe_done ack's model-facing text (owner, context diet
 *  2026-10-09): the assessment is the CALL's arguments — durable in the
 *  transcript, streamed to the learner — so echoing it back in the
 *  result would duplicate the probe phase's largest payload in every
 *  future context. The agent sees this fixed line instead; `details`
 *  carries only {ok:true} for the record/UI. Same doctrine as
 *  CONCLUDE_ACK_TEXT. */
export const PROBE_DONE_ACK_TEXT =
	"Assessment recorded — it is shown to the learner now and the teacher plans from it. Say your closing sentence and end your turn; the teaching phase takes over from here.";

/** The ack when the probe recommends practice: no handoff is queued — the
 *  learner's card offers Switch to practice / Teach me anyway. */
export const PROBE_DONE_PRACTICE_ACK_TEXT =
	"Assessment recorded — he already holds this at his target level, so the learner now chooses: switch this chat to practice, or be taught anyway. Say one closing sentence and end your turn.";
