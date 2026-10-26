import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlanTree } from "@/src/core";
import { conceptNumbers, planLayout } from "@/components/plan-map";
import { conceptOpenings, openingKey } from "@/components/concept-markers";
import { continueMessage } from "@/components/concept-done-card";

// The CB2 plan's shape: one chain plus several roots that each feed a later node.
const tree: PlanTree = {
	nodes: [
		{ id: "receptor", title: "Receptor vs enzyme" },
		{ id: "gpcr", title: "GPCR switch" },
		{ id: "brake", title: "Brake logic" },
		{ id: "agonist", title: "Agonist vs blocker" },
		{ id: "gi", title: "CB2 Gi signal" },
		{ id: "proof", title: "Blockade proof" },
	],
	edges: [
		{ from: "receptor", to: "gpcr" },
		{ from: "gpcr", to: "gi" },
		{ from: "brake", to: "gi" },
		{ from: "agonist", to: "proof" },
		{ from: "gi", to: "proof" },
	],
	version: 1,
};

const quiz = (nodeId: string) => ({ type: "tool-quiz", state: "output-available", input: { nodeId } });
const done = (nodeId: string, nextNodeId?: string) => ({ type: "tool-concept_done", state: "output-available", input: { nodeId, nextNodeId, recap: ["r"] } });
const text = (t: string) => ({ type: "text", text: t });

describe("planLayout", () => {
	it("puts a prerequisite right above what needs it, not every root in the top row", () => {
		const l = planLayout(tree);
		const y = (id: string) => l.pos.get(id)!.y;
		assert.equal(y("receptor") < y("gpcr"), true);
		assert.equal(y("brake"), y("gpcr"), "brake sits beside gpcr, just above gi");
		assert.equal(y("agonist"), y("gi"), "agonist sits just above proof");
		assert.equal(new Set(l.order).size, tree.nodes.length);
	});
});

describe("conceptNumbers", () => {
	it("numbers taught concepts in teaching order, then up next, then the rest", () => {
		const l = planLayout(tree);
		const messages = [{ parts: [quiz("receptor"), quiz("gpcr"), quiz("brake"), done("brake", "gi")] }];
		const { order, number } = conceptNumbers(tree, l, messages, "gi");
		assert.deepEqual(order.slice(0, 4), ["receptor", "gpcr", "brake", "gi"]);
		assert.equal(number.get("gi"), 4);
		assert.equal(order.length, tree.nodes.length);
	});
});

describe("conceptOpenings", () => {
	it("opens concepts inside one merged message, right after the previous check", () => {
		const messages = [{ role: "assistant", parts: [text("teach receptor"), quiz("receptor"), text("teach gpcr"), quiz("gpcr")] }];
		const o = conceptOpenings(messages, tree);
		assert.equal(o.get(openingKey(0, 0))?.nodeId, "receptor");
		assert.equal(o.get(openingKey(0, 2))?.nodeId, "gpcr");
	});

	it("the Continue message opens the next concept", () => {
		const messages = [
			{ role: "assistant", parts: [quiz("brake"), done("brake", "gi")] },
			{ role: "user", parts: [text(continueMessage("CB2 Gi signal"))] },
			{ role: "assistant", parts: [text("teach gi"), quiz("gi")] },
		];
		const o = conceptOpenings(messages, tree);
		assert.deepEqual(o.get(openingKey(1, "u")), { nodeId: "gi", viaContinue: true });
		assert.equal([...o.values()].filter((v) => v.nodeId === "gi").length, 1, "gi opens once");
	});

	it("an ordinary user message is not a concept opening", () => {
		const messages = [
			{ role: "assistant", parts: [quiz("brake"), done("brake", "gi")] },
			{ role: "user", parts: [text("wait, can you explain brakes again?")] },
		];
		assert.equal(conceptOpenings(messages, tree).has(openingKey(1, "u")), false);
	});
});
