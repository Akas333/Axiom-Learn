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
	masteryStateOf,
	claimPracticeOf,
	CLAIM_HISTORY_MAX,
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
		content: [{ type: "toolCall", id, name, arguments: args as never }],
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
		const callId = (messages[2] as unknown as { content: [{ id: string }] }).content[0].id;
		assert.deepEqual(reviewEventsOf(messages), [
			{ nodeId: "a", at: T0 + 1000, grade: 3, mode: "recall", callId, outcome: "solved" },
			{ nodeId: "b", at: T0 + 1000, grade: 3, mode: "recall", callId, outcome: "solved" },
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
		assert.deepEqual(
			reviewEventsOf(messages).map(({ nodeId, grade, outcome }) => ({ nodeId, grade, outcome })),
			[{ nodeId: "a", grade: 1, outcome: "surrendered" }],
		);
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

// ── missedTargets, careless slips, and the named states ─────────────────────

const poseMode = (target: string[], mode: string, at: number) =>
	call(PRACTICE_PROBLEM_TOOL, { statement: "s", mode, modelSolution: "m", target }, at);
const concludeWith = (args: Record<string, unknown>, at: number) =>
	call(PRACTICE_CONCLUDE_TOOL, { verdict: "v", rung: null, missClass: null, retest: false, ...args }, at);

describe("reviewEventsOf with missedTargets", () => {
	it("a finished problem blames only the missed targets and credits the rest", () => {
		const messages = [
			...poseMode(["a", "b", "c"], "composition", T0),
			...concludeWith({ outcome: "solvedWithHints", rung: "R4", missedTargets: ["b"] }, T0 + 1),
		];
		const grades = Object.fromEntries(reviewEventsOf(messages).map((e) => [e.nodeId, e.grade]));
		assert.deepEqual(grades, { a: 3, b: 1, c: 3 });
	});

	it("a surrendered problem gives no evidence about targets it did not break on", () => {
		const messages = [
			...poseMode(["a", "b"], "composition", T0),
			...concludeWith({ outcome: "surrendered", missedTargets: ["a"] }, T0 + 1),
		];
		assert.deepEqual(
			reviewEventsOf(messages).map((e) => [e.nodeId, e.grade]),
			[["a", 1]],
		);
	});

	it("ignores missedTargets that are not targets of the problem", () => {
		const messages = [
			...poseMode(["a", "b"], "composition", T0),
			...concludeWith({ outcome: "surrendered", missedTargets: ["zzz"] }, T0 + 1),
		];
		assert.deepEqual(
			reviewEventsOf(messages).map((e) => [e.nodeId, e.grade]),
			[["a", 1], ["b", 1]],
		);
	});

	it("stamps the session id when the caller passes one", () => {
		const messages = [...pose(["a"], T0), ...conclude("solved", null, T0 + 1)];
		assert.equal(reviewEventsOf(messages, "chat_1")[0]!.session, "chat_1");
	});
});

describe("careless slips", () => {
	it("a careless miss is graded as effortful, not forgotten", () => {
		assert.equal(gradeForConclusion("surrendered", null, "careless"), 2);
		assert.equal(gradeForConclusion("surrendered", null, "cue"), 1);
		assert.equal(gradeForConclusion("solved", null, "careless"), 3);
	});
});

describe("masteryStateOf (the named states)", () => {
	const at = (days: number) => T0 + days * DAY;
	const stateOf = (events: ReviewEvent[], nowDays: number) =>
		masteryStateOf(reviewStates(events, at(nowDays)).get("a"));

	it("never practiced is untested", () => {
		assert.equal(masteryStateOf(undefined), "untested");
	});

	it("a latest miss is shaky, even after earlier successes", () => {
		assert.equal(
			stateOf(
				[
					{ nodeId: "a", at: at(0), grade: 3, session: "s1" },
					{ nodeId: "a", at: at(3), grade: 3, session: "s2" },
					{ nodeId: "a", at: at(5), grade: 1, session: "s3" },
				],
				5,
			),
			"shaky",
		);
	});

	it("clean successes inside one session in one mode are only developing", () => {
		assert.equal(
			stateOf(
				[
					{ nodeId: "a", at: at(0), grade: 3, session: "s1", mode: "recall" },
					{ nodeId: "a", at: at(0) + 1000, grade: 3, session: "s1", mode: "recall" },
				],
				0,
			),
			"developing",
		);
	});

	it("a success that needed hints is developing", () => {
		assert.equal(stateOf([{ nodeId: "a", at: at(0), grade: 2, session: "s1" }], 0), "developing");
	});

	it("clean successes in two sessions are solid", () => {
		assert.equal(
			stateOf(
				[
					{ nodeId: "a", at: at(0), grade: 3, session: "s1" },
					{ nodeId: "a", at: at(3), grade: 3, session: "s2" },
				],
				3,
			),
			"solid",
		);
	});

	it("clean successes in two modes within one session are solid", () => {
		assert.equal(
			stateOf(
				[
					{ nodeId: "a", at: at(0), grade: 3, session: "s1", mode: "recall" },
					{ nodeId: "a", at: at(0) + 1000, grade: 3, session: "s1", mode: "discrimination" },
				],
				0,
			),
			"solid",
		);
	});

	it("solid turns due once recall fades, and back to solid after a fresh success", () => {
		const events: ReviewEvent[] = [
			{ nodeId: "a", at: at(0), grade: 3, session: "s1" },
			{ nodeId: "a", at: at(3), grade: 3, session: "s2" },
		];
		assert.equal(stateOf(events, 200), "due");
		assert.equal(stateOf([...events, { nodeId: "a", at: at(200), grade: 3, session: "s3" }], 200), "solid");
	});

	it("the memory note names the state for the practice agent", () => {
		const state = reviewStates([{ nodeId: "a", at: T0, grade: 1 }], T0).get("a");
		assert.match(memoryNote(state, T0), /; state shaky(;|$)/);
	});
});

describe("claimPracticeOf (the graph's per-claim summary)", () => {
	it("gives each practiced claim its state and newest-first history", () => {
		const events: ReviewEvent[] = [
			{ nodeId: "a", at: T0, grade: 3, session: "s1", callId: "c1", outcome: "solved" },
			{ nodeId: "a", at: T0 + 3 * DAY, grade: 1, session: "s2", callId: "c2", outcome: "surrendered" },
			{ nodeId: "b", at: T0, grade: 2, session: "anki:2026-10-01", mode: "flashcard" },
		];
		const out = claimPracticeOf(events, T0 + 3 * DAY);
		assert.deepEqual(Object.keys(out).sort(), ["a", "b"]);
		assert.equal(out.a!.state, "shaky");
		assert.equal(out.a!.reviews, 2);
		assert.deepEqual(out.a!.history.map((h) => h.callId), ["c2", "c1"]);
		assert.equal("nodeId" in out.a!.history[0]!, false);
		assert.equal(out.b!.state, "developing");
	});

	it("caps the history", () => {
		const events: ReviewEvent[] = Array.from({ length: CLAIM_HISTORY_MAX + 4 }, (_, i) => ({
			nodeId: "a",
			at: T0 + i * DAY,
			grade: 3 as const,
		}));
		const out = claimPracticeOf(events, T0 + 20 * DAY);
		assert.equal(out.a!.history.length, CLAIM_HISTORY_MAX);
		assert.equal(out.a!.history[0]!.at, T0 + (CLAIM_HISTORY_MAX + 3) * DAY);
	});
});
