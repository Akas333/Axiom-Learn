import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nearestStop, parseSpokenConfidence as p } from "@/components/spoken-confidence";

describe("spoken confidence", () => {
	it("reads numbers said with certainty words", () => {
		assert.equal(p("I'm about 70 percent sure"), 70);
		assert.equal(p("I'm 90% confident it's the second one."), 90);
		assert.equal(p("I'd say seventy percent confident"), 70);
		assert.equal(p("Maybe eighty-five percent chance I'm right"), 85);
		assert.equal(p("I'm like seven out of ten sure"), 70);
	});
	it("reads a bare number when the sentence is short", () => {
		assert.equal(p("About seventy percent."), 70);
		assert.equal(p("Ninety percent"), 90);
	});
	it("ignores percents inside reasoning", () => {
		assert.equal(p("Because half the charge, so 50 percent of it flows into the plate and the rest leaves"), null);
	});
	it("reads phrases, negations first", () => {
		assert.equal(p("I'm completely sure"), 100);
		assert.equal(p("I am certain."), 100);
		assert.equal(p("Very confident about this"), 90);
		assert.equal(p("I'm pretty sure it's B"), 70);
		assert.equal(p("Honestly it's fifty-fifty"), 50);
		assert.equal(p("I'm not very sure"), 30);
		assert.equal(p("Just guessing here"), 30);
		assert.equal(p("Not sure at all, really"), 30);
		assert.equal(p("I'm not sure"), 50);
		assert.equal(p("not at all sure"), 0);
	});
	it("returns null for plain reasoning", () => {
		assert.equal(p("The current into the node has to equal the current out"), null);
		assert.equal(p(""), null);
	});
	it("snaps to the nearest stop", () => {
		const stops = [0, 30, 50, 70, 90, 100];
		assert.equal(stops[nearestStop(stops, 85)], 90);
		assert.equal(stops[nearestStop(stops, 60)], 50);
		assert.equal(stops[nearestStop(stops, 40)], 30);
	});
});
