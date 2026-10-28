/**
 * Practice colouring on the graph: the legend counts every proposition,
 * with unpracticed ones as untested, and the canvas override replaces the
 * topic colours only while it is set.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ClaimPractice } from "@/src/core";
import { practiceStateCounts } from "../components/graph-view.tsx";

const practiced = (state: ClaimPractice["state"]): ClaimPractice => ({
	state,
	recall: 0.9,
	dueAt: 0,
	reviews: 1,
	history: [],
});

describe("practiceStateCounts", () => {
	it("counts each proposition once, unpracticed as untested", () => {
		const counts = practiceStateCounts(["a", "b", "c", "d"], { a: practiced("solid"), b: practiced("shaky") });
		assert.deepEqual(counts, { untested: 2, shaky: 1, developing: 0, solid: 1, due: 0 });
	});

	it("ignores practice for claims no longer in the graph", () => {
		const counts = practiceStateCounts(["a"], { a: practiced("due"), gone: practiced("solid") });
		assert.equal(counts.solid, 0);
		assert.equal(counts.due, 1);
	});

	it("everything is untested without practice data", () => {
		assert.deepEqual(practiceStateCounts(["a", "b"], undefined), { untested: 2, shaky: 0, developing: 0, solid: 0, due: 0 });
	});
});
