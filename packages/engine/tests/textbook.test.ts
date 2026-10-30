/**
 * THE TEXTBOOK STYLE (2026-10-29): the stage and nuance-coverage folds,
 * the stage tools (section, illustration, the tagged exercise), the
 * concept_done coverage gate, the turn stopper, and the prompt
 * composition (textbook/ + an allowlist of teacher/, never the guided
 * step loop).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LhMessage } from "../src/core/native-messages.ts";
import type { PlanTree } from "../src/core/contracts/plan.ts";
import { deriveCoverage, textbookPose, textbookStage } from "../src/core/textbook.ts";
import { textbookTools } from "../src/agent/tools/textbook.ts";
import { conceptDoneTool } from "../src/agent/tools/concept.ts";
import { composeInstructions, makeQuestionStopper } from "../src/agent/teacher-agent.ts";
import { listSourceSegments } from "../src/agent/prompt-segments.ts";
import { derivePlanStatuses, derivePlanStatusesLh, nodeProgress } from "../src/core/contracts/plan.ts";

const STAMPS = {
	api: "faux",
	provider: "test",
	model: "test-model",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason: "toolUse",
} as const;

let seq = 0;
/** One assistant tool call plus its result (clean unless isError). */
function call(name: string, args: Record<string, unknown>, isError = false): LhMessage[] {
	const id = `call_${++seq}`;
	return [
		{ id: `m_${id}`, role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }], timestamp: seq, ...STAMPS } as never,
		{ id: `r_${id}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: "ok" }], details: null, isError, timestamp: seq } as never,
	];
}

const TREE: PlanTree = {
	nodes: [
		{ id: "enclosed-current", title: "Only enclosed current counts" },
		{ id: "partial-enclosure", title: "Partial enclosure" },
		{ id: "nonuniform-j", title: "Non-uniform J" },
	],
	edges: [{ from: "enclosed-current", to: "partial-enclosure" }],
	version: 1,
};

const SECTION_BODY = "Ampère's law relates the circulation of $\\vec B$ around a closed path to the current it encloses. ".repeat(4);

function storeOf(messages: LhMessage[], extra: Record<string, unknown> = {}) {
	return { getChat: (_id: string) => ({ messages, tree: TREE, style: "textbook", ...extra }) } as never;
}

describe("textbookStage", () => {
	it("walks intuition → section → illustrations → exercises → done", () => {
		const record: LhMessage[] = [];
		assert.equal(textbookStage(record), null);
		record.push(...call("quiz", { type: "predict", nodeId: "enclosed-current", question: "?" }));
		assert.equal(textbookStage(record), "intuition");
		record.push(...call("section", { title: "Ampère's law", body: SECTION_BODY }));
		assert.equal(textbookStage(record), "section");
		record.push(...call("illustration", { nodeId: "partial-enclosure", difficulty: "tricky", statement: "s", steps: ["a", "b"] }));
		assert.equal(textbookStage(record), "illustrations");
		record.push(...call("problem", { statement: "p", nodeIds: ["nonuniform-j"], modelSolution: "m" }));
		assert.equal(textbookStage(record), "exercises");
		record.push(...call("concept_done", { nodeId: "nonuniform-j", recap: ["r"] }));
		assert.equal(textbookStage(record), "done");
	});

	it("ignores failed stage calls", () => {
		const record = [...call("section", { title: "t", body: "short" }, true)];
		assert.equal(textbookStage(record), null);
	});
});

/** A prose-only assistant message (a closing line, a wake turn's reply). */
function prose(text: string): LhMessage {
	return { id: `p_${++seq}`, role: "assistant", content: [{ type: "text", text }], timestamp: seq, ...STAMPS, stopReason: "stop" } as never;
}

/** A background delivery landing in the transcript (a finished figure). */
function delivery(): LhMessage {
	return { id: `steer_${++seq}`, role: "custom", customType: "subagent-steer", content: "figure", display: true, details: { kind: "visual" }, timestamp: seq } as never;
}

describe("textbookPose", () => {
	it("waits on a clean section", () => {
		const record = [...call("section", { title: "t", body: SECTION_BODY })];
		assert.deepEqual(textbookPose(record), { callId: `call_${seq}`, tool: "section", buried: false });
	});

	it("keeps waiting through the tutor's closing line", () => {
		const record = [...call("section", { title: "t", body: SECTION_BODY }), prose("Read the section — press Continue when done.")];
		assert.equal(textbookPose(record)?.buried, false);
		assert.equal(textbookPose(record)?.tool, "section");
	});

	it("keeps waiting when a figure lands and wakes the tutor, and says the card is pushed up", () => {
		const record = [
			...call("illustration", { nodeId: "partial-enclosure", difficulty: "standard", statement: "s", steps: ["a", "b"] }),
			prose("Try it first."),
			delivery(),
			prose("Figure 1 is up."),
		];
		assert.deepEqual(textbookPose(record), { callId: `call_${seq - 3}`, tool: "illustration", buried: true });
	});

	it("stops waiting once the learner replies", () => {
		const record = [
			...call("section", { title: "t", body: SECTION_BODY }),
			{ id: "u1", role: "user", content: "why is it sin?", timestamp: ++seq } as never,
			prose("Because…"),
		];
		assert.equal(textbookPose(record), null);
	});

	it("stops waiting when a later call poses something else", () => {
		const record = [...call("section", { title: "t", body: SECTION_BODY }), delivery(), ...call("quiz", { type: "predict", question: "?" })];
		assert.equal(textbookPose(record), null);
	});

	it("never waits on a failed section", () => {
		assert.equal(textbookPose([...call("section", { title: "t", body: "short" }, true)]), null);
	});
});

describe("deriveCoverage", () => {
	it("covers a nuance only through an exercise solved at rung R1 or less, minus missedTargets", () => {
		const record: LhMessage[] = [
			...call("illustration", { nodeId: "partial-enclosure", difficulty: "tricky", statement: "s", steps: ["a", "b"] }),
			...call("problem", { statement: "p1", nodeIds: ["enclosed-current", "partial-enclosure"], modelSolution: "m" }),
			...call("conclude", { outcome: "solvedWithHints", rung: "R1", missedTargets: ["partial-enclosure"], verdict: "v", missClass: null, retest: true }),
			...call("problem", { statement: "p2", nodeIds: ["nonuniform-j"], modelSolution: "m" }),
			...call("conclude", { outcome: "solvedWithHints", rung: "R3", verdict: "v", missClass: "cue", retest: true }),
		];
		const coverage = deriveCoverage(TREE, record);
		assert.equal(coverage.states.get("enclosed-current"), "covered");
		assert.equal(coverage.states.get("partial-enclosure"), "seen", "illustrated, but the exercise broke on it");
		assert.equal(coverage.states.get("nonuniform-j"), "pending", "R3 is not solving it yourself");
		assert.deepEqual(coverage.uncovered, ["partial-enclosure", "nonuniform-j"]);
		assert.equal(coverage.illustrationCount, 1);
	});
});

describe("plan progress in a textbook chat", () => {
	it("illustrations and exercises move the position; only coverage marks a node done", () => {
		const record: LhMessage[] = [
			...call("illustration", { nodeId: "partial-enclosure", difficulty: "tricky", statement: "s", steps: ["a", "b"] }),
			...call("problem", { statement: "p", nodeIds: ["enclosed-current"], modelSolution: "m" }),
			...call("conclude", { outcome: "solved", rung: "R0", verdict: "v", missClass: null, retest: false }),
			...call("problem", { statement: "p", nodeIds: ["nonuniform-j"], modelSolution: "m" }),
		];
		const statuses = derivePlanStatusesLh(TREE, record);
		assert.equal(statuses.current, "nonuniform-j");
		assert.equal(nodeProgress(statuses, "enclosed-current"), "done");
		assert.equal(nodeProgress(statuses, "partial-enclosure"), "taught", "illustrated is taught, not covered");
	});

	it("marks taught-but-untested nodes until an exercise covers them", () => {
		const record: LhMessage[] = [
			...call("quiz", { type: "predict", nodeId: "enclosed-current", question: "?" }),
			...call("section", { title: "Ampère's law", body: SECTION_BODY }),
			...call("illustration", { nodeId: "partial-enclosure", difficulty: "standard", statement: "s", steps: ["a", "b"] }),
			...call("problem", { statement: "p", nodeIds: ["nonuniform-j", "enclosed-current"], modelSolution: "m" }),
		];
		let statuses = derivePlanStatusesLh(TREE, record);
		assert.equal(nodeProgress(statuses, "nonuniform-j"), "current");
		assert.equal(nodeProgress(statuses, "enclosed-current"), "taught", "the predict check taught it");
		assert.equal(nodeProgress(statuses, "partial-enclosure"), "taught");

		record.push(...call("conclude", { outcome: "solved", rung: "R1", verdict: "v", missClass: null, retest: false }));
		statuses = derivePlanStatusesLh(TREE, record);
		assert.equal(nodeProgress(statuses, "enclosed-current"), "done");
		assert.equal(nodeProgress(statuses, "partial-enclosure"), "taught", "no exercise covered it yet");
	});

	it("reads the side panel's view parts the same way, where a posed exercise stays input-available", () => {
		const tool = (name: string, input: Record<string, unknown>, state = "output-available") => ({ type: `tool-${name}`, state, input });
		const parts = [
			tool("quiz", { type: "predict", nodeId: "enclosed-current", question: "?" }, "output-available"),
			tool("illustration", { nodeId: "partial-enclosure", difficulty: "standard", statement: "s", steps: ["a", "b"] }),
			tool("problem", { statement: "p", nodeIds: ["nonuniform-j", "enclosed-current"], modelSolution: "m" }, "input-available"),
		];
		let statuses = derivePlanStatuses(TREE, [{ parts }]);
		assert.equal(statuses.current, "nonuniform-j", "the open exercise is where the learner is");
		assert.equal(nodeProgress(statuses, "enclosed-current"), "taught");

		parts.push(tool("conclude", { outcome: "solved", rung: "R0", verdict: "v", missClass: null, retest: false }));
		statuses = derivePlanStatuses(TREE, [{ parts }]);
		assert.equal(nodeProgress(statuses, "enclosed-current"), "done");
		assert.equal(nodeProgress(statuses, "nonuniform-j"), "current");
		assert.equal(statuses.done.has("nonuniform-j"), true);
		assert.equal(nodeProgress(statuses, "partial-enclosure"), "taught");
	});

	it("keeps the guided loop free of the taught state", () => {
		const record: LhMessage[] = [
			...call("quiz", { nodeId: "enclosed-current", question: "?" }),
			...call("quiz", { nodeId: "partial-enclosure", question: "?" }),
		];
		const statuses = derivePlanStatusesLh(TREE, record);
		assert.equal(statuses.taught.size, 0);
		assert.equal(nodeProgress(statuses, "enclosed-current"), "done");
	});
});

describe("textbook tools", () => {
	it("section refuses a thin body and ends the turn on a full one", async () => {
		const tools = textbookTools({ chatId: "c1", chatStore: storeOf([]) });
		const thin = await tools.section!.execute("t1", { title: "Ampère's law", body: "Too short." });
		assert.ok((thin.details as { problems?: string[] }).problems?.length);
		const full = await tools.section!.execute("t2", { title: "Ampère's law", body: SECTION_BODY });
		assert.equal(full.terminate, true);
	});

	it("illustration validates its node and numbers itself after earlier ones", async () => {
		const earlier = call("illustration", { nodeId: "enclosed-current", difficulty: "standard", statement: "s", steps: ["a", "b"] });
		const tools = textbookTools({ chatId: "c1", chatStore: storeOf(earlier) });
		const bad = await tools.illustration!.execute("t1", { nodeId: "nope", difficulty: "tricky", statement: "s", steps: ["a", "b"] });
		assert.match(JSON.stringify(bad.details), /matches no node/);
		const good = await tools.illustration!.execute("t2", { nodeId: "partial-enclosure", difficulty: "tricky", statement: "s", steps: ["a", "b"] });
		assert.deepEqual(good.details, { number: 2 });
		assert.equal(good.terminate, true);
	});

	it("the exercise validates nodeIds and holds the one-active gate with conclude", async () => {
		const tools = textbookTools({ chatId: "c1", chatStore: storeOf([]) });
		const bad = await tools.problem!.execute("t1", { statement: "p", nodeIds: ["nope"], modelSolution: "m" });
		assert.match(JSON.stringify(bad.details), /match no node/);
		const posed = await tools.problem!.execute("t2", { statement: "p", nodeIds: ["nonuniform-j"], modelSolution: "m" });
		assert.equal(posed.terminate, true);
		const second = await tools.problem!.execute("t3", { statement: "p", nodeIds: ["nonuniform-j"], modelSolution: "m" });
		assert.match(JSON.stringify(second.details), /already active/);
		const concluded = await tools.conclude!.execute("t4", {
			outcome: "solved", verdict: "v", rung: null, missClass: null, retest: false,
		});
		assert.ok(!(concluded.details as { problems?: unknown } | null)?.problems, "conclude frees the gate the exercise held");
	});
});

describe("concept_done in a textbook chat", () => {
	const input = { nodeId: "nonuniform-j", recap: ["Circulation of B = μ0 times enclosed current."] };

	it("refuses while nuances are uncovered, naming them", async () => {
		const tool = conceptDoneTool({ chatId: "c1", chatStore: storeOf([]) });
		const res = await tool.execute("t1", input);
		assert.match(JSON.stringify(res.details), /enclosed-current, partial-enclosure, nonuniform-j/);
	});

	it("closes once every node is covered, or the open ones are skipped", async () => {
		const covered: LhMessage[] = [
			...call("problem", { statement: "p", nodeIds: ["enclosed-current", "partial-enclosure", "nonuniform-j"], modelSolution: "m" }),
			...call("conclude", { outcome: "solved", rung: null, verdict: "v", missClass: null, retest: false }),
		];
		const done = await conceptDoneTool({ chatId: "c1", chatStore: storeOf(covered) }).execute("t1", input);
		assert.equal(done.terminate, true);
		const skipped = await conceptDoneTool({ chatId: "c1", chatStore: storeOf([]) }).execute("t2", {
			...input,
			skipped: ["enclosed-current", "partial-enclosure", "nonuniform-j"],
		});
		assert.equal(skipped.terminate, true);
	});

	it("never gates a guided chat", async () => {
		const res = await conceptDoneTool({ chatId: "c1", chatStore: storeOf([], { style: undefined }) }).execute("t1", input);
		assert.equal(res.terminate, true);
	});
});

describe("the textbook turn stopper", () => {
	const turn = (name: string, isError = false) => ({
		message: { content: [{ type: "toolCall", id: "x1", name }] },
		toolResults: [{ toolCallId: "x1", isError }],
	});

	it("a clean section, illustration or exercise ends a textbook run; the guided teacher keeps running on them", () => {
		const textbook = makeQuestionStopper("textbook");
		for (const name of ["section", "illustration", "problem"]) {
			assert.equal(textbook(turn(name)), true, name);
			assert.equal(textbook(turn(name, true)), false, `${name} that failed retries`);
		}
		assert.equal(makeQuestionStopper("teacher")(turn("section")), false);
	});
});

describe("textbook prompt composition", () => {
	it("composes textbook/ with the allowlisted teacher fragments and never the guided step loop", () => {
		const paths = listSourceSegments("textbook").map((s) => s.path);
		for (const p of ["system-prompt.md", "teacher/05-method.md", "teacher/10-planning.md", "textbook/20-concept-loop.md", "textbook/22-intuition.md", "textbook/27-exercises.md"]) {
			assert.ok(paths.includes(p), p);
		}
		for (const p of ["teacher/20-teaching.md", "teacher/25-concept-close.md", "teacher/28-predictions.md"]) {
			assert.ok(!paths.includes(p), p);
		}
		assert.ok(!listSourceSegments("teacher").some((s) => s.path.startsWith("textbook/")));
		assert.match(composeInstructions("textbook"), /imaginary closed loop around a current-carrying wire/);
	});
});
