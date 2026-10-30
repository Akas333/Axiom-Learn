import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GATE_START, gateStep, type GateState } from "@/components/voice-thinking";

function run(levels: number[], start: GateState = GATE_START, dt = 50) {
	let state = start;
	const actions: (string | null)[] = [];
	levels.forEach((level, i) => {
		const step = gateStep(state, level, (i + 1) * dt);
		state = step.state;
		actions.push(step.action);
	});
	return { state, actions };
}

describe("voice gate", () => {
	it("ignores a single loud blip", () => {
		assert.deepEqual(run([0.9, 0, 0]).actions, [null, null, null]);
	});
	it("opens after two loud ticks in a row", () => {
		assert.deepEqual(run([0.6, 0.6]).actions, [null, "open"]);
	});
	it("stays open through short pauses and ends after 1.2s of quiet", () => {
		const { actions } = run([0.6, 0.6, ...new Array(30).fill(0)]);
		assert.equal(actions.indexOf("end"), 2 + 24); // first tick past 1200ms of silence
		assert.equal(actions.filter((a) => a === "end").length, 1);
	});
	it("quiet speech above the keep level holds the segment open", () => {
		const { actions } = run([0.6, 0.6, ...new Array(40).fill(0.3)]);
		assert.ok(!actions.includes("end"));
	});
});
