import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeLearnerContext, parseLearnerBody, sanitizeLearner, LEARNER_NOTES_MAX } from "../src/core/learner.ts";
import { sanitizeUserSettings } from "../src/core/settings.ts";
import { resolveSettings } from "../src/core/settings-resolution.ts";
import { SETTINGS_SECTIONS } from "../src/server/settings-body.ts";
import { createFauxCore } from "@earendil-works/pi-ai";
import { createPracticeAgent, createProberAgent, createTeacherAgent } from "../src/agent/teacher-agent.ts";
import type { PiEngine } from "../src/agent/models.ts";
import { chatStore } from "../src/store/chats.ts";
import { jobStore } from "../src/store/jobs.ts";

function fauxEngine(): PiEngine {
	const faux = createFauxCore({});
	return { model: faux.getModel(), streamFn: faux.streamSimple };
}

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

describe("learner profile reaches every tutor's system prompt", () => {
	const notes = "I'm in 6th grade. Use cricket examples, I love cricket.";
	const learnerContext = composeLearnerContext({ level: "middle", math: "none", notes });
	const promptOf = (agent: { state: { systemPrompt: string } }) => agent.state.systemPrompt;

	it("prober, teacher and practice all carry the learner's own words and level", () => {
		const chatId = chatStore.createChat("Learner prompt test").id;
		const agents = {
			prober: createProberAgent({ chatId, chatStore, deliver: () => {}, jobStore, spawn: () => {} }, { engine: fauxEngine(), learnerContext }),
			teacher: createTeacherAgent(undefined, { engine: fauxEngine(), learnerContext }),
			practice: createPracticeAgent({ chatId, chatStore } as never, { engine: fauxEngine(), learnerContext }),
		};
		for (const [kind, agent] of Object.entries(agents)) {
			const prompt = promptOf(agent);
			assert.match(prompt, /> I'm in 6th grade\. Use cricket examples, I love cricket\./, `${kind} has the notes`);
			assert.match(prompt, /middle-school student/, `${kind} has the level`);
			assert.match(prompt, /Avoid equations/, `${kind} has the math preference`);
			assert.ok(prompt.trimEnd().endsWith("adapt to what you observe in this session."), `${kind}: the profile is the last word`);
		}
	});

	it("adds nothing when the learner gave no profile", () => {
		const bare = promptOf(createTeacherAgent(undefined, { engine: fauxEngine() }));
		const empty = promptOf(createTeacherAgent(undefined, { engine: fauxEngine(), learnerContext: "" }));
		assert.equal(empty, bare);
		assert.doesNotMatch(bare, /About this learner/);
	});
});
