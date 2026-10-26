import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conceptDoneTool } from "../src/agent/tools/concept.ts";
import { derivePlanStatuses, derivePlanStatusesLh, nodeProgress, type PlanTree } from "../src/core/contracts.ts";
import type { ChatStore } from "../src/core/ports.ts";
import type { LhMessage } from "../src/core/native-messages.ts";

const tree: PlanTree = {
	nodes: [
		{ id: "gpcr", title: "GPCR switch" },
		{ id: "brake", title: "Brake logic" },
		{ id: "gi", title: "CB2 Gi signal" },
	],
	edges: [
		{ from: "gpcr", to: "gi" },
		{ from: "brake", to: "gi" },
	],
	version: 1,
};

function tool(withTree: PlanTree | null = tree) {
	const chatStore = { getChat: () => ({ id: "c", tree: withTree ?? undefined }) } as unknown as ChatStore;
	return conceptDoneTool({ chatId: "c", chatStore });
}

const run = (input: unknown) => tool().execute("call_1", input as never);

describe("concept_done tool", () => {
	it("closes a node, resolves titles, and ends the turn", async () => {
		const r = await run({ nodeId: "brake", recap: ["A brake only slows the machine it acts on."], nextNodeId: "gi", nextHint: "So what does Gi brake?" });
		assert.equal(r.terminate, true);
		assert.deepEqual(r.details, { nodeId: "brake", title: "Brake logic", nextNodeId: "gi", nextTitle: "CB2 Gi signal" });
		assert.match((r.content[0] as { text: string }).text, /CB2 Gi signal/);
	});

	it("allows closing the last node with no next node", async () => {
		const r = await run({ nodeId: "gi", recap: ["Gi brakes adenylate cyclase."] });
		assert.equal(r.terminate, true);
		assert.equal((r.details as { nextTitle: null }).nextTitle, null);
	});

	it("rejects unknown node ids so the teacher retries", async () => {
		const r = await run({ nodeId: "nope", recap: ["x"], nextNodeId: "also-nope" });
		assert.equal((r as { isError?: boolean }).isError, true);
		assert.match((r.content[0] as { text: string }).text, /nope/);
		assert.notEqual(r.terminate, true, "an invalid call doesn't end the turn");
	});

	it("rejects an empty recap and a next node equal to the closed one", async () => {
		const r = await run({ nodeId: "gpcr", recap: ["   "], nextNodeId: "gpcr" });
		const text = (r.content[0] as { text: string }).text;
		assert.match(text, /must differ/);
		assert.match(text, /non-empty/);
	});

	it("rejects calls before a plan exists", async () => {
		const r = await tool(null).execute("call_2", { nodeId: "gpcr", recap: ["x"] } as never);
		assert.equal((r as { isError?: boolean }).isError, true);
	});
});

const assistantCalls = (calls: Array<{ name: string; args: Record<string, unknown> }>): LhMessage =>
	({
		id: "a",
		role: "assistant",
		content: calls.map((c, i) => ({ type: "toolCall", id: `t${i}`, name: c.name, arguments: c.args })),
	}) as unknown as LhMessage;

describe("plan statuses with concept_done", () => {
	it("a closed node is done and its named next node becomes current", () => {
		const s = derivePlanStatusesLh(tree, [
			assistantCalls([
				{ name: "quiz", args: { nodeId: "brake" } },
				{ name: "concept_done", args: { nodeId: "brake", nextNodeId: "gi" } },
			]),
		]);
		assert.equal(s.current, "gi");
		assert.ok(s.done.has("brake"));
		assert.ok(s.visited.has("brake"));
		assert.equal(nodeProgress(s, "brake"), "done");
		assert.equal(nodeProgress(s, "gi"), "current");
		assert.equal(nodeProgress(s, "gpcr"), "upcoming");
	});

	it("the next tagged check moves current on as before", () => {
		const s = derivePlanStatusesLh(tree, [
			assistantCalls([
				{ name: "quiz", args: { nodeId: "brake" } },
				{ name: "concept_done", args: { nodeId: "brake", nextNodeId: "gi" } },
				{ name: "quiz", args: { nodeId: "gpcr" } },
			]),
		]);
		assert.equal(s.current, "gpcr");
		assert.ok(s.done.has("brake"));
	});

	it("without concept_done, statuses are unchanged (nothing is done)", () => {
		const s = derivePlanStatusesLh(tree, [assistantCalls([{ name: "quiz", args: { nodeId: "gpcr" } }, { name: "quiz", args: { nodeId: "brake" } }])]);
		assert.equal(s.current, "brake");
		assert.deepEqual([...s.visited], ["gpcr"]);
		assert.equal(s.done.size, 0);
		assert.equal(nodeProgress(s, "gpcr"), "done", "taught and left behind reads as done");
		assert.equal(nodeProgress(s, "gi"), "upcoming");
	});

	it("the UI-parts fold agrees, and ignores a failed concept_done", () => {
		const s = derivePlanStatuses(tree, [
			{
				parts: [
					{ type: "tool-quiz", input: { nodeId: "brake" } },
					{ type: "tool-concept_done", state: "output-available", input: { nodeId: "brake", nextNodeId: "gi" } },
					{ type: "tool-concept_done", state: "output-error", input: { nodeId: "gi" } },
				],
			},
		]);
		assert.equal(s.current, "gi");
		assert.deepEqual([...s.done], ["brake"]);
	});
});

describe("auto-continuation after concept_done", () => {
	const call = (name: string, id: string) =>
		({ id: "a1", role: "assistant", content: [{ type: "toolCall", id, name, arguments: { nodeId: "brake", recap: ["x"] } }] }) as unknown as LhMessage;
	const result = (name: string, id: string, isError = false) =>
		({ id: `r_${id}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: "ok" }], details: {}, isError }) as unknown as LhMessage;

	it("a closed concept waits for the learner instead of waking a turn", async () => {
		const { needsContinuation } = await import("../src/core/native-messages.ts");
		assert.equal(needsContinuation([call("concept_done", "t1"), result("concept_done", "t1")]), false);
	});

	it("a failed concept_done is still owed a retry", async () => {
		const { needsContinuation } = await import("../src/core/native-messages.ts");
		assert.equal(needsContinuation([call("concept_done", "t1"), result("concept_done", "t1", true)]), true);
	});
});
