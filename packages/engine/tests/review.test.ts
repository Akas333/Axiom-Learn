/**
 * SPACED REVIEW (knowledge decay): the practice record → per-node review
 * events → FSRS memory state (stability, recall, due date).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";
import { PRACTICE_CONCLUDE_TOOL, PRACTICE_PROBLEM_TOOL, newGraphContextMessage, type LhMessage } from "../src/core/native-messages.ts";
import {
	dueOrder,
	gradeForConclusion,
	intervalDays,
	memoryNote,
	retrievability,
	reviewEventsOf,
	reviewStates,
	type ReviewEvent,
} from "../src/core/review.ts";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1);

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

let seq = 0;
function call(name: string, args: Record<string, unknown>, at: number, isError = false): LhMessage[] {
	const id = `call_${++seq}`;
	const assistant: LhMessage & AssistantMessage = {
		id: `msg_a_${id}`,
		role: "assistant",
		content: [{ type: "toolCall", id, name, arguments: args }],
		timestamp: at,
		...STAMPS,
	};
	const ack: LhMessage & ToolResultMessage = {
		id: `msg_r_${id}`,
		role: "toolResult",
		toolCallId: id,
		toolName: name,
		content: [{ type: "text", text: "ok" }],
		details: null,
		isError,
		timestamp: at,
	};
	return [assistant, ack];
}

const pose = (target: string[] | undefined, at: number, isError = false) =>
	call(PRACTICE_PROBLEM_TOOL, { statement: "s", mode: "recall", modelSolution: "m", ...(target ? { target } : {}) }, at, isError);
const conclude = (outcome: string, rung: string | null, at: number, isError = false) =>
	call(PRACTICE_CONCLUDE_TOOL, { outcome, verdict: "v", rung, missClass: null, retest: false }, at, isError);

describe("gradeForConclusion", () => {
	it("maps outcomes and hint rungs to FSRS grades", () => {
		assert.equal(gradeForConclusion("solved", null), 3);
		assert.equal(gradeForConclusion("solved", "R0"), 3);
		assert.equal(gradeForConclusion("solved", "R2"), 2);
		assert.equal(gradeForConclusion("solvedWithHints", "R1"), 2);
		assert.equal(gradeForConclusion("solvedWithHints", "R3"), 1);
		assert.equal(gradeForConclusion("surrendered", null), 1);
		assert.equal(gradeForConclusion("dismissed", null), 1);
	});

	it("moved-on says nothing about memory", () => {
		assert.equal(gradeForConclusion("movedOn", null), null);
	});
});

describe("reviewEventsOf", () => {
	it("one event per target of each clean conclude, stamped with the conclude's time", () => {
		const messages = [...pose(["a", "b"], T0), ...conclude("solved", null, T0 + 1000)];
		assert.deepEqual(reviewEventsOf(messages), [
			{ nodeId: "a", at: T0 + 1000, grade: 3 },
			{ nodeId: "b", at: T0 + 1000, grade: 3 },
		]);
	});

	it("skips untagged problems, refused concludes, and moved-on", () => {
		const messages = [
			...pose(undefined, T0),
			...conclude("solved", null, T0 + 1),
			...pose(["a"], T0 + 2),
			...conclude("solved", null, T0 + 3, true),
			...conclude("movedOn", null, T0 + 4),
		];
		assert.deepEqual(reviewEventsOf(messages), []);
	});

	it("a refused pose does not lend its targets to the next conclude", () => {
		const messages = [...pose(["a"], T0), ...pose(["x"], T0 + 1, true), ...conclude("surrendered", null, T0 + 2)];
		assert.deepEqual(reviewEventsOf(messages), [{ nodeId: "a", at: T0 + 2, grade: 1 }]);
	});
});

describe("FSRS memory state", () => {
	it("recall is 90% exactly one stability after a review", () => {
		assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-9);
		assert.ok(Math.abs(intervalDays(10) - 10) < 1e-9);
	});

	it("recall decays over time — strong today, weaker two weeks later", () => {
		const events: ReviewEvent[] = [{ nodeId: "a", at: T0, grade: 3 }];
		const today = reviewStates(events, T0).get("a")!;
		const later = reviewStates(events, T0 + 14 * DAY).get("a")!;
		assert.equal(today.recall, 1);
		assert.ok(later.recall < 0.9, `expected decay, got ${later.recall}`);
		assert.equal(today.due, false);
		assert.equal(later.due, true);
	});

	it("spaced successes grow stability; a miss shrinks it", () => {
		const good = reviewStates(
			[
				{ nodeId: "a", at: T0, grade: 3 },
				{ nodeId: "a", at: T0 + 3 * DAY, grade: 3 },
				{ nodeId: "a", at: T0 + 12 * DAY, grade: 3 },
			],
			T0 + 12 * DAY,
		).get("a")!;
		const missed = reviewStates(
			[
				{ nodeId: "a", at: T0, grade: 3 },
				{ nodeId: "a", at: T0 + 3 * DAY, grade: 3 },
				{ nodeId: "a", at: T0 + 12 * DAY, grade: 1 },
			],
			T0 + 12 * DAY,
		).get("a")!;
		assert.ok(good.stability > 10, `stability grew: ${good.stability}`);
		assert.ok(missed.stability < good.stability / 3, `a miss shrinks it: ${missed.stability}`);
		assert.equal(good.reviews, 3);
	});

	it("dueOrder lists only due nodes, weakest recall first", () => {
		const states = reviewStates(
			[
				{ nodeId: "fresh", at: T0 + 29 * DAY, grade: 3 },
				{ nodeId: "old", at: T0, grade: 3 },
				{ nodeId: "missed", at: T0 + 20 * DAY, grade: 1 },
			],
			T0 + 30 * DAY,
		);
		assert.deepEqual(
			dueOrder(states.values()).map((s) => s.nodeId),
			["missed", "old"],
		);
	});
});

describe("memory notes in the session context", () => {
	it("annotates picks for the practice agent", () => {
		const state = reviewStates([{ nodeId: "a", at: T0, grade: 1 }], T0 + 5 * DAY).get("a");
		const note = memoryNote(state, T0 + 5 * DAY);
		assert.match(note, /last practiced 5 days ago \(missed\)/);
		assert.match(note, /DUE for review/);
		assert.equal(memoryNote(undefined, T0), "memory: never practiced");

		const msg = newGraphContextMessage([{ id: "a", name: "A", statement: "S" }], [], { a: note });
		assert.match(String(msg.content), /- \[a\] A: S \(memory: last practiced/);
	});

	it("leaves picks unannotated without notes", () => {
		const msg = newGraphContextMessage([{ id: "a", name: "A", statement: "S" }], []);
		assert.match(String(msg.content), /- \[a\] A: S$/m);
	});
});
