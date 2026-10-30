/**
 * THE GRADED-ANSWER LOG (2026-10-30): the read-time fold from chat records
 * to answer events, and the per-node ability fold over those events.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";
import { abilityOf, answerEventsOf, itemDifficulty, type AnswerEvent } from "../src/core/answer-log.ts";
import { PRACTICE_CONCLUDE_TOOL, PRACTICE_PROBLEM_TOOL, type LhMessage } from "../src/core/native-messages.ts";
import { probeQuizInputSchema, quizInputObject } from "../src/core/question-core.ts";
import { problemInputObject } from "../src/agent/tools/practice.ts";

const STAMPS = {
	api: "faux",
	provider: "test",
	model: "test-model",
	usage: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	},
	stopReason: "toolUse",
} as const;

type AssistantToolArgs = Extract<AssistantMessage["content"][number], { type: "toolCall" }>["arguments"];

let clock = 0;

function call(name: string, id: string, args: Record<string, unknown>, details: unknown = null, isError = false): LhMessage[] {
	clock += 2;
	const assistant: LhMessage & AssistantMessage = {
		id: `msg_a_${id}`,
		role: "assistant",
		content: [{ type: "toolCall", id, name, arguments: args as AssistantToolArgs }],
		timestamp: clock - 1,
		...STAMPS,
	};
	const result: LhMessage & ToolResultMessage = {
		id: `msg_r_${id}`,
		role: "toolResult",
		toolCallId: id,
		toolName: name,
		content: [{ type: "text", text: "ok" }],
		details: details as ToolResultMessage["details"],
		isError,
		timestamp: clock,
	};
	return [assistant, result];
}

function quizAnswer(correct: boolean, extra: Record<string, unknown> = {}) {
	return {
		kind: "quiz",
		questionText: "Which planet is closest to the sun?",
		dontKnow: false,
		answers: [],
		correct,
		answeredAt: `2026-10-30T10:00:0${clock % 10}.000Z`,
		...extra,
	};
}

function record(messages: LhMessage[]) {
	return { id: "chat_1", messages };
}

describe("answerEventsOf", () => {
	it("logs a teach quiz with its node, difficulty, confidence and role", () => {
		const events = answerEventsOf(
			record(call("quiz", "q1", { type: "check", nodeId: "kcl", difficulty: 4 }, quizAnswer(true, { confidence: 80, questionType: "check" }))),
		);
		assert.equal(events.length, 1);
		const e = events[0]!;
		assert.deepEqual(
			{ tool: e.tool, phase: e.phase, nodeSpace: e.nodeSpace, nodeIds: e.nodeIds, difficulty: e.difficulty, score: e.score, confidence: e.confidence, questionType: e.questionType },
			{ tool: "quiz", phase: "teach", nodeSpace: "plan", nodeIds: ["kcl"], difficulty: 4, score: 1, confidence: 80, questionType: "check" },
		);
	});

	it("logs a probe quiz untagged, and 'I don't know' as a miss", () => {
		const [e] = answerEventsOf(record(call("probe", "p1", {}, quizAnswer(false, { dontKnow: true }))));
		assert.equal(e!.phase, "probe");
		assert.deepEqual(e!.nodeIds, []);
		assert.equal(e!.score, 0);
		assert.equal(e!.dontKnow, true);
		assert.equal(e!.difficulty, undefined);
	});

	it("skips dismissed, errored, ungraded and ask/explain results", () => {
		const messages = [
			...call("quiz", "d1", { nodeId: "a" }, quizAnswer(true, { dismissed: true })),
			...call("quiz", "e1", { nodeId: "a" }, quizAnswer(true), true),
			...call("explain", "x1", { nodeId: "a" }, { kind: "explain", questionText: "Why?", dontKnow: false, answers: [], answeredAt: "2026-10-30T10:00:00.000Z" }),
			...call("ask_user_question", "k1", {}, { kind: "ask", questionText: "Goal?", dontKnow: false, answers: [], answeredAt: "2026-10-30T10:00:00.000Z" }),
		];
		assert.deepEqual(answerEventsOf(record(messages)), []);
	});

	it("drops an out-of-range difficulty", () => {
		const [e] = answerEventsOf(record(call("quiz", "q9", { nodeId: "a", difficulty: 9 }, quizAnswer(true))));
		assert.equal(e!.difficulty, undefined);
	});

	it("grades a practice problem at its conclude, with the pose's targets and difficulty", () => {
		const messages = [
			...call(PRACTICE_PROBLEM_TOOL, "pr1", { statement: "Find I₂.", mode: "recall", target: ["n1", "n2"], difficulty: 2, modelSolution: "…" }),
			...call(PRACTICE_CONCLUDE_TOOL, "c1", { outcome: "solvedWithHints", verdict: "ok", rung: "R2", missClass: "cue", retest: false }),
		];
		const [e] = answerEventsOf(record(messages));
		assert.deepEqual(
			{ phase: e!.phase, nodeSpace: e!.nodeSpace, nodeIds: e!.nodeIds, difficulty: e!.difficulty, score: e!.score, outcome: e!.outcome, rung: e!.rung, missClass: e!.missClass, questionText: e!.questionText },
			{ phase: "practice", nodeSpace: "graph", nodeIds: ["n1", "n2"], difficulty: 2, score: 0.5, outcome: "solvedWithHints", rung: "R2", missClass: "cue", questionText: "Find I₂." },
		);
	});

	it("skips a dismissed problem and a conclude with no clean pose", () => {
		const messages = [
			...call(PRACTICE_PROBLEM_TOOL, "pr1", { statement: "A", mode: "recall", modelSolution: "…" }),
			...call(PRACTICE_CONCLUDE_TOOL, "c1", { outcome: "dismissed" }),
			...call(PRACTICE_PROBLEM_TOOL, "pr2", { statement: "B", mode: "recall", modelSolution: "…" }, null, true),
			...call(PRACTICE_CONCLUDE_TOOL, "c2", { outcome: "solved" }),
		];
		assert.deepEqual(answerEventsOf(record(messages)), []);
	});
});

describe("abilityOf", () => {
	const ev = (nodeId: string, score: number, at: string, difficulty?: number): AnswerEvent => ({
		chatId: "chat_1",
		toolCallId: at,
		tool: "quiz",
		phase: "teach",
		nodeSpace: "plan",
		nodeIds: [nodeId],
		questionText: "",
		score,
		answeredAt: at,
		...(difficulty !== undefined ? { difficulty } : {}),
	});

	it("rises on right answers, falls on wrong ones, and counts them", () => {
		const [up] = abilityOf([ev("a", 1, "1"), ev("a", 1, "2")]);
		const [down] = abilityOf([ev("b", 0, "1"), ev("b", 0, "2")]);
		assert.ok(up!.theta > 0 && up!.pMid > 0.5);
		assert.ok(down!.theta < 0 && down!.pMid < 0.5);
		assert.equal(up!.n, 2);
	});

	it("credits a hard item more than an easy one", () => {
		const [hard] = abilityOf([ev("a", 1, "1", 5)]);
		const [easy] = abilityOf([ev("a", 1, "1", 1)]);
		assert.ok(hard!.theta > easy!.theta);
	});

	it("keeps plan nodes apart per chat and folds untagged events into nothing", () => {
		const other = { ...ev("a", 1, "2"), chatId: "chat_2" };
		const untagged = { ...ev("a", 1, "3"), nodeIds: [] };
		const out = abilityOf([ev("a", 1, "1"), other, untagged]);
		assert.equal(out.length, 2);
		assert.deepEqual(out.map((a) => a.chatId).sort(), ["chat_1", "chat_2"]);
	});

	it("maps difficulty 3 and unrated items to the middle of the scale", () => {
		assert.equal(itemDifficulty(3), 0);
		assert.equal(itemDifficulty(undefined), 0);
		assert.ok(itemDifficulty(5) > itemDifficulty(1));
	});
});

describe("difficulty on the question tools", () => {
	it("is an optional field on the probe quiz, the teach quiz and the practice problem", () => {
		for (const schema of [probeQuizInputSchema, quizInputObject, problemInputObject]) {
			assert.ok("difficulty" in schema.properties);
			assert.ok(!((schema.required ?? []) as string[]).includes("difficulty"));
		}
	});
});
