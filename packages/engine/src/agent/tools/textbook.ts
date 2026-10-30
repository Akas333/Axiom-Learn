/**
 * THE TEXTBOOK TOOLS (2026-10-29): the stages of a textbook-style concept
 * that are not questions. `section` is the full textbook reading;
 * `illustration` is one worked example the learner reveals step by step;
 * `problem` (here: an exercise tagged with the plan nodes — the nuances —
 * it covers) and `conclude` reuse the practice pair's gate, card, dock and
 * hint flow. All three poses END THE TURN: the learner reads, tries,
 * reveals, asks, and presses Continue / Next problem.
 *
 * Mechanics-only descriptions (the practice tools' rule): what to pass and
 * what happens. The method lives in prompts/textbook/.
 */

import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { invalidInputResult, problemResult } from "../tool-execute.ts";
import { healToolRecord } from "./heal.ts";
import { concludeTool, createPracticeGate, type PracticeGate, type PracticeToolContext } from "./practice.ts";
import { deriveCoverage, TEXTBOOK_ILLUSTRATION_TOOL, TEXTBOOK_SECTION_TOOL } from "../../core/textbook.ts";
import type { PlanTree } from "../../core/contracts/plan.ts";
import type { LhMessage } from "../../core/native-messages.ts";

export interface TextbookToolContext {
	chatId: string;
	chatStore: { getChat(id: string): { messages: LhMessage[]; tree?: PlanTree; kind?: string } | null };
}

function treeOf(ctx: TextbookToolContext): PlanTree | undefined {
	return ctx.chatStore.getChat(ctx.chatId)?.tree;
}

function unknownNodes(tree: PlanTree | undefined, ids: readonly string[]): string[] {
	const known = new Set((tree?.nodes ?? []).map((n) => n.id));
	return ids.filter((id) => !known.has(id));
}

function stageAck(text: string, details: unknown): AgentToolResult<unknown> {
	return { content: [{ type: "text", text }], details, terminate: true };
}

// ─── section: the textbook reading ──────────────────────────────────────────

export const sectionInput = Type.Object({
	title: Type.String({ description: "REQUIRED — the section's title, e.g. 'Ampère's circuital law'." }),
	body: Type.String({
		description:
			"REQUIRED — the full section in markdown + LaTeX: statement, definitions, numbered standard equations " +
			"(display math, $$ on lines of their own, numbered with \\tag{1}), sign conventions, validity, how to apply it. Figures go through `visual` and are referred to by number.",
	}),
});

export type SectionInput = Static<typeof sectionInput>;

export function sectionTool(): AgentTool<typeof sectionInput> {
	return {
		name: TEXTBOOK_SECTION_TOOL,
		label: TEXTBOOK_SECTION_TOOL,
		description:
			"Show the concept's textbook section as a reading card. Ends the turn — the learner reads it and presses Continue " +
			"(or asks about it); then the illustrations begin.",
		parameters: sectionInput,
		execute: async (_toolCallId, input) => {
			const problems: string[] = [];
			if (!input.title.trim()) problems.push("title must not be empty");
			if (input.body.trim().length < 200) problems.push("body is too short for a full textbook section — write the whole section");
			if (problems.length > 0) return invalidInputResult(TEXTBOOK_SECTION_TOOL, problems);
			return stageAck(
				"Section shown — the turn ends here. The learner reads it; his next message (Continue, or a question about it) is your cue. Answer any question, then move to the illustrations.",
				{ title: input.title.trim() },
			);
		},
	};
}

// ─── illustration: one worked example, revealed step by step ────────────────

export const illustrationInput = Type.Object({
	nodeId: Type.String({ description: "REQUIRED — the plan node (nuance) this illustration works, an exact plan_init slug." }),
	difficulty: Type.Union([Type.Literal("standard"), Type.Literal("tricky")], {
		description: "REQUIRED — standard or tricky (bare word, no quotes).",
	}),
	title: Type.Optional(Type.String({ description: "A short name, e.g. 'Coaxial cable, b < r < c'." })),
	source: Type.Optional(
		Type.String({ description: "When it comes from the learner's material: where (e.g. 'Illustration 4.16 in your book')." }),
	),
	statement: Type.String({ description: "REQUIRED — the problem statement (markdown + LaTeX), shown first." }),
	steps: Type.Array(Type.String(), {
		minItems: 2,
		description:
			"REQUIRED — the worked solution as atomic, motivated steps (markdown + LaTeX), revealed one at a time. " +
			"Each step says why it is taken, not only what is done; the last step states the result.",
	}),
});

export type IllustrationInput = Static<typeof illustrationInput>;

export function illustrationTool(ctx: TextbookToolContext): AgentTool<typeof illustrationInput> {
	return {
		name: TEXTBOOK_ILLUSTRATION_TOOL,
		label: TEXTBOOK_ILLUSTRATION_TOOL,
		description:
			"Show one worked illustration: the statement first, then the steps the learner reveals one at a time (he may try it " +
			"first and ask about any step). Ends the turn; his Continue (or question) is your cue for the next illustration.",
		parameters: illustrationInput,
		execute: async (_toolCallId, input) => {
			const record = ctx.chatStore.getChat(ctx.chatId);
			const tree = record?.tree;
			const problems: string[] = [];
			if (!tree || tree.nodes.length === 0) problems.push("No plan map exists yet — call plan_init first.");
			else if (unknownNodes(tree, [input.nodeId]).length > 0)
				problems.push(`nodeId "${input.nodeId}" matches no node in this session's plan map.`);
			if (!input.statement.trim()) problems.push("statement must not be empty");
			const steps = input.steps.map((s) => s.trim()).filter(Boolean);
			if (steps.length < 2) problems.push("steps needs at least two non-empty steps");
			if (problems.length > 0) return invalidInputResult(TEXTBOOK_ILLUSTRATION_TOOL, problems);
			const number = deriveCoverage(tree, record?.messages ?? []).illustrationCount + 1;
			return stageAck(
				`Illustration ${number} shown — the turn ends here. The learner tries it and reveals the steps; his next message ` +
					"(Continue, or a question about a step) is your cue.",
				{ number },
			);
		},
	};
}

// ─── problem: an exercise, tagged with the nuances it covers ─────────────────

export const exerciseInput = Type.Object({
	statement: Type.String({
		description: "REQUIRED — the exercise as the learner sees it (markdown + LaTeX). Self-contained; never names the nuance it tests.",
	}),
	nodeIds: Type.Array(Type.String(), {
		minItems: 1,
		description: "REQUIRED — the plan nodes (nuances) a correct solution must use, exact plan_init slugs.",
	}),
	builds: Type.Optional(
		Type.Array(Type.Number(), {
			minItems: 1,
			description: "The illustration number(s) this exercise extends (one) or combines (two).",
		}),
	),
	modelSolution: Type.String({
		description: "REQUIRED — the full solution, moves in order, committed BEFORE the learner sees the problem. conclude reveals it verbatim.",
	}),
});

export type ExerciseInput = Static<typeof exerciseInput>;

export function exerciseTool(ctx: TextbookToolContext, gate: PracticeGate): AgentTool<typeof exerciseInput> {
	return {
		name: "problem",
		label: "problem",
		description:
			"Pose one exercise. Ends the turn — the learner works in the thinking field; his traces and answers arrive as " +
			"messages. The modelSolution stays hidden until you conclude. Only one exercise may be active — conclude it first.",
		parameters: exerciseInput,
		executionMode: "sequential",
		execute: async (_toolCallId, input) => {
			if (gate.problemActive) {
				return invalidInputResult("problem", ["an exercise is already active — call conclude on it before posing the next one"]);
			}
			const tree = treeOf(ctx);
			const unknown = unknownNodes(tree, input.nodeIds);
			if (unknown.length > 0) {
				return invalidInputResult("problem", [`nodeIds ${JSON.stringify(unknown)} match no node in this session's plan map`]);
			}
			gate.problemActive = true;
			return problemResult();
		},
	};
}

/** The textbook additions to the teacher's registry. */
export function textbookTools(ctx: TextbookToolContext): Record<string, AgentTool<any>> {
	const gate = createPracticeGate(ctx as PracticeToolContext);
	return healToolRecord({
		section: sectionTool(),
		illustration: illustrationTool(ctx),
		problem: exerciseTool(ctx, gate),
		conclude: concludeTool(gate),
	});
}
