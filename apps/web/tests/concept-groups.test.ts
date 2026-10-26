import { test } from "node:test";
import assert from "node:assert/strict";
import { conceptGroups } from "../components/graph-canvas.ts";

function graph(edges: [string, string][]): Map<string, Set<string>> {
	const nb = new Map<string, Set<string>>();
	const add = (a: string, b: string) => {
		if (!nb.has(a)) nb.set(a, new Set());
		nb.get(a)!.add(b);
	};
	for (const [a, b] of edges) {
		add(a, b);
		add(b, a);
	}
	return nb;
}

test("two separate triangles become two groups, biggest first", () => {
	const nb = graph([
		["a", "b"], ["b", "c"], ["c", "a"],
		["x", "y"], ["y", "z"], ["z", "x"], ["z", "w"],
	]);
	const groups = conceptGroups(["a", "b", "c", "w", "x", "y", "z"], nb);
	assert.equal(groups.get("x"), 0); // 4 members
	assert.equal(groups.get("w"), 0);
	assert.equal(groups.get("a"), 1); // 3 members
	assert.equal(groups.get("a"), groups.get("c"));
});

test("isolated nodes and lone pairs get no group", () => {
	const nb = graph([["p", "q"]]);
	const groups = conceptGroups(["p", "q", "solo"], nb);
	assert.equal(groups.size, 0);
});

test("same input gives the same groups", () => {
	const nb = graph([["a", "b"], ["b", "c"], ["c", "d"], ["d", "a"], ["e", "f"], ["f", "g"], ["g", "e"], ["d", "e"]]);
	const ids = ["a", "b", "c", "d", "e", "f", "g"];
	assert.deepEqual([...conceptGroups(ids, nb)], [...conceptGroups(ids, nb)]);
});
