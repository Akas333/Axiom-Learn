/**
 * The question-bank readers (2026-10-30): find_questions (real exam
 * questions matching a subject / chapter / topic / exam / format /
 * difficulty, with their answers and solutions) and question_bank_topics
 * (the chapters and topics the bank covers). Read-only; registered only
 * when a bank exists. Mechanics only — when to reach for them lives in
 * prompts/shared/47-question-bank.md.
 */
import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { serverExecute } from "../tool-execute.ts";
import {
	BANK_DEFAULT_LIMIT,
	BANK_MAX_LIMIT,
	bankOutline,
	formatBankQuestion,
	searchQuestions,
	type BankQuestion,
} from "../../core/question-bank.ts";

export interface QuestionBankToolContext {
	/** The loaded bank (src/store/question-bank.ts loadQuestionBank). */
	questions: () => readonly BankQuestion[];
	/** Injectable sampling for tests. */
	random?: () => number;
}

const findQuestionsInput = Type.Object({
	subject: Type.Optional(Type.String({ description: "physics, chemistry or maths." })),
	chapter: Type.Optional(Type.String({ description: "Part of a chapter name, e.g. 'current electricity' (question_bank_topics lists them)." })),
	topic: Type.Optional(Type.String({ description: "Part of a topic name, e.g. 'kirchhoff'." })),
	text: Type.Optional(Type.String({ description: "Words that must all appear in the question text." })),
	exam: Type.Optional(
		Type.Union([Type.Literal("jee_main"), Type.Literal("jee_advanced"), Type.Literal("none")], {
			description: "jee_main or jee_advanced for past-paper questions; none for practice-sheet questions only.",
		}),
	),
	format: Type.Optional(
		Type.Union(
			[
				Type.Literal("mcq_single"),
				Type.Literal("mcq_multi"),
				Type.Literal("integer"),
				Type.Literal("numerical"),
				Type.Literal("passage"),
				Type.Literal("matrix"),
			],
			{ description: "The question type." },
		),
	),
	difficulty: Type.Optional(
		Type.Union([Type.Literal("easy"), Type.Literal("medium"), Type.Literal("hard")], { description: "The bank's difficulty tag." }),
	),
	exclude: Type.Optional(Type.Array(Type.String(), { description: "Question ids (the [id] in earlier results) to leave out." })),
	limit: Type.Optional(
		Type.Integer({ minimum: 1, maximum: BANK_MAX_LIMIT, description: `How many to return (default ${BANK_DEFAULT_LIMIT}, at most ${BANK_MAX_LIMIT}).` }),
	),
});

const topicsInput = Type.Object({
	subject: Type.Optional(Type.String({ description: "physics, chemistry or maths; omit to list the subjects." })),
});

export function questionBankTools(ctx: QuestionBankToolContext): Record<string, AgentTool<any>> {
	return {
		find_questions: {
			name: "find_questions",
			label: "find_questions",
			description:
				"Find real exam questions (JEE Main / JEE Advanced past papers and coaching practice sheets) in the question bank. " +
				"Every filter is optional and they combine; chapter, topic and text match case-insensitively on parts of names. " +
				"Returns a random sample of the matches, each with its [id], source, chapter › topic, type, difficulty, text, options, " +
				"answer and worked solution when the bank has one. Images are markdown links. Pass earlier ids in exclude to get new ones.",
			parameters: findQuestionsInput,
			execute: serverExecute("find_questions", findQuestionsInput, async (input): Promise<string> => {
				const { total, questions } = searchQuestions(ctx.questions(), input, ctx.random);
				if (total === 0) {
					return "No questions match. Loosen a filter, or call question_bank_topics for the chapter and topic names.";
				}
				return (
					`${total} question(s) match; showing ${questions.length}:\n\n` +
					questions.map(formatBankQuestion).join("\n\n---\n\n")
				);
			}),
		},
		question_bank_topics: {
			name: "question_bank_topics",
			label: "question_bank_topics",
			description:
				"List what the question bank covers: the subjects, or for one subject its chapters with their topics and question counts.",
			parameters: topicsInput,
			execute: serverExecute("question_bank_topics", topicsInput, async (input): Promise<string> =>
				bankOutline(ctx.questions(), input.subject),
			),
		},
	};
}
