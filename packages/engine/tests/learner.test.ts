import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeLearnerContext, parseLearnerBody, sanitizeLearner, LEARNER_NOTES_MAX } from "../src/core/learner.ts";
import { sanitizeUserSettings } from "../src/core/settings.ts";
import { resolveSettings } from "../src/core/settings-resolution.ts";
import { SETTINGS_SECTIONS } from "../src/server/settings-body.ts";

describe("learner profile", () => {
	it("adds nothing to the prompt before the learner says anything", () => {
		assert.equal(composeLearnerContext(undefined), "");
		assert.equal(composeLearnerContext({ onboarded: true }), "");
		assert.equal(composeLearnerContext({ notes: "   " }), "");
	});

	it("caps a middle-schooler below vector calculus", () => {
		const block = composeLearnerContext({ level: "middle", math: "light", style: "intuitive" });
		assert.match(block, /# About this learner/);
		assert.match(block, /middle-school/);
		assert.match(block, /curl, divergence/);
		assert.match(block, /Intuition/i);
	});

	it("quotes the learner's own notes", () => {
		const block = composeLearnerContext({ notes: "I'm preparing for JEE.\nShow me derivations." });
		assert.match(block, /> I'm preparing for JEE\./);
		assert.match(block, /> Show me derivations\./);
	});

	it("parses strictly on write", () => {
		assert.deepEqual(parseLearnerBody({ level: "high", math: "rigorous", onboarded: true }), {
			ok: true,
			settings: { level: "high", math: "rigorous", onboarded: true },
		});
		assert.equal(parseLearnerBody({ level: "kindergarten" }).ok, false);
		assert.equal(parseLearnerBody({ notes: 3 }).ok, false);
		assert.equal(parseLearnerBody({ notes: "x".repeat(LEARNER_NOTES_MAX + 1) }).ok, false);
		assert.equal(SETTINGS_SECTIONS.learner, parseLearnerBody);
	});

	it("sanitizes leniently on read and resolves through settings", () => {
		assert.deepEqual(sanitizeLearner({ level: "bogus", math: "none", onboarded: "yes" }), { math: "none" });
		const record = sanitizeUserSettings({ version: 1, learner: { level: "undergrad", style: "formal" } });
		assert.deepEqual(record?.learner, { level: "undergrad", style: "formal" });
		assert.deepEqual(resolveSettings(record).learner, { level: "undergrad", style: "formal" });
		assert.deepEqual(resolveSettings(null).learner, {});
	});
});
