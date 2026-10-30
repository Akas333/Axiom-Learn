import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { PiEngine } from "../src/agent/models.ts";
import { preferenceLayer } from "../src/agent/preferences.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";
import { clearPreferences, generatePreferences, parsePreferenceNotes, readPreferences } from "../src/server/preferences.ts";

/** A model that always replies with `text`. */
function replying(text: string): PiEngine {
	return {
		model: { id: "fake", provider: "fake" } as never,
		streamFn: (async function* () {
			yield { type: "done", message: { role: "assistant", content: [{ type: "text", text }] } };
		}) as never,
	};
}

describe("learner preferences", () => {
	beforeEach(() => clearPreferences());

	it("reads the notes out of a fenced or chatty reply", () => {
		const notes = parsePreferenceNotes('Sure!\n```json\n{"shared": "- Use football analogies.", "teacher": 3}\n```');
		assert.equal(notes.shared, "- Use football analogies.");
		assert.equal(notes.teacher, "");
		assert.equal(notes.practice, "");
		assert.throws(() => parsePreferenceNotes("no json here"));
	});

	it("leaves the built-in prompts untouched when nothing is set", () => {
		assert.equal(preferenceLayer("teacher"), "");
		assert.ok(!composeInstructions("teacher").includes("The learner's own preferences"));
	});

	it("appends the notes after the built-in prompt, shared first", async () => {
		const before = composeInstructions("teacher");
		await generatePreferences("I like short answers and football examples", {
			engine: replying('{"shared": "- Keep answers short.", "teacher": "- Use football examples.", "practice": ""}'),
		});
		const after = composeInstructions("teacher");
		assert.ok(after.startsWith(before), "the built-in prompt stays first and unchanged");
		const layer = after.slice(before.length);
		assert.ok(layer.indexOf("- Keep answers short.") < layer.indexOf("- Use football examples."));
		assert.ok(!composeInstructions("practice").includes("football"));
		assert.equal(readPreferences().request, "I like short answers and football examples");
	});

	it("keeps the earlier preferences when the model's reply is unusable", async () => {
		await generatePreferences("short answers", { engine: replying('{"shared": "- Keep answers short."}') });
		await assert.rejects(generatePreferences("something else", { engine: replying("I can't help with that.") }));
		assert.equal(readPreferences().notes.shared, "- Keep answers short.");
		assert.equal(readPreferences().request, "short answers");
	});

	it("clearing goes back to the built-in prompts", async () => {
		await generatePreferences("short answers", { engine: replying('{"shared": "- Keep answers short."}') });
		clearPreferences();
		assert.equal(preferenceLayer("prober"), "");
	});
});
