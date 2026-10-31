/**
 * Onboarding's "how do you like to learn?" step, server side: the learner's
 * own words (typed or dictated) go to THEIR strong model, which rewrites
 * them into one short note per agent (agent/preferences.ts composes them
 * after the built-in prompts). The raw words are kept too, so the step can
 * show what was said and regenerate later.
 *
 * Anything that goes wrong — no model set, a failed call, a reply that is
 * not the JSON asked for — leaves the existing files untouched: the agents
 * keep running on their defaults (plus any earlier preferences).
 */

import fs from "node:fs";
import path from "node:path";
import { normalizeContext, type AssistantMessage, type Message } from "@earendil-works/pi-ai";
import { FILES } from "../../config.ts";
import { piEngineForSpec, type PiEngine } from "../agent/models.ts";
import { PREFERENCE_MAX_CHARS, PREFERENCE_TARGETS, preferenceFile, readPreference, type PreferenceTarget } from "../agent/preferences.ts";
import { resolveRoleSpec } from "../core/settings-resolution.ts";
import { stores } from "./stores.ts";

export interface PreferencesView {
	/** What the learner said, verbatim. */
	request: string;
	/** The note each agent composes; "" = built-in prompt only. */
	notes: Record<PreferenceTarget, string>;
}

const REQUEST_FILE = () => path.join(FILES.preferencesDir, "request.txt");
const REQUEST_MAX_CHARS = 4000;

const SYSTEM_PROMPT = `You configure TYSA, a learning harness, from a learner's description of how they like to learn.

The app has these agents:
- prober: asks diagnostic questions to find what the learner already understands, before any teaching.
- teacher: plans a path and teaches step by step in a guided session (predict, explain, check).
- textbook: teaches like a well-written textbook chapter: sections, intuition, illustrations, exercises.
- practice: runs practice sessions with varied problems and adaptive hints.
- shared: applies to every agent (tone, language, formatting, examples, pacing).

Each agent already has a detailed built-in prompt. Your notes are appended after it and must only ADD the learner's preferences. Never contradict how the app works: do not tell an agent to skip measuring, skip questions, stop using its tools, change answer formats, or stop checking understanding.

Write each note as short imperative Markdown bullets addressed to that agent, e.g. "- Use football analogies where they fit." Put a preference in "shared" when it applies everywhere and in a specific agent only when it is about that agent's job. Leave a field as "" when nothing the learner said applies. Ignore anything that is not a learning preference. Write in the learner's language.

Reply with ONLY a JSON object, no code fence: {"shared": "...", "prober": "...", "teacher": "...", "textbook": "...", "practice": "..."}`;

export class PreferencesError extends Error {}

export function readPreferences(): PreferencesView {
	let request = "";
	try {
		request = fs.readFileSync(REQUEST_FILE(), "utf-8");
	} catch {
		// nothing said yet
	}
	const notes = Object.fromEntries(PREFERENCE_TARGETS.map((t) => [t, readPreference(t)])) as Record<PreferenceTarget, string>;
	return { request, notes };
}

/** Pull the notes out of the model's reply. Pure, exported for tests.
 *  Tolerates a code fence or prose around the object; anything else
 *  throws, so the caller keeps the existing files. */
export function parsePreferenceNotes(reply: string): Record<PreferenceTarget, string> {
	const start = reply.indexOf("{");
	const end = reply.lastIndexOf("}");
	if (start === -1 || end <= start) throw new PreferencesError("The model did not return preferences.");
	let parsed: unknown;
	try {
		parsed = JSON.parse(reply.slice(start, end + 1));
	} catch {
		throw new PreferencesError("The model's reply could not be read.");
	}
	if (!parsed || typeof parsed !== "object") throw new PreferencesError("The model did not return preferences.");
	const record = parsed as Record<string, unknown>;
	return Object.fromEntries(
		PREFERENCE_TARGETS.map((t) => [t, typeof record[t] === "string" ? (record[t] as string).trim().slice(0, PREFERENCE_MAX_CHARS) : ""]),
	) as Record<PreferenceTarget, string>;
}

function writeAll(request: string, notes: Record<PreferenceTarget, string>): void {
	fs.mkdirSync(FILES.preferencesDir, { recursive: true });
	fs.writeFileSync(REQUEST_FILE(), request, "utf-8");
	for (const t of PREFERENCE_TARGETS) {
		if (notes[t]) fs.writeFileSync(preferenceFile(t), `${notes[t]}\n`, "utf-8");
		else fs.rmSync(preferenceFile(t), { force: true });
	}
}

async function complete(engine: PiEngine, text: string, signal?: AbortSignal): Promise<string> {
	const messages: Message[] = [{ role: "user", content: [{ type: "text", text }], timestamp: Date.now() }];
	const stream = engine.streamFn(engine.model, normalizeContext({ systemPrompt: SYSTEM_PROMPT, messages, tools: [] }), { signal } as never);
	let result: AssistantMessage | null = null;
	for await (const event of stream) {
		if (event.type === "done") {
			result = event.message;
			break;
		}
		if (event.type === "error") throw new PreferencesError(event.error.errorMessage ?? "The model call failed.");
	}
	if (!result) throw new PreferencesError("The model stopped without replying.");
	return result.content
		.filter((b) => b.type === "text")
		.map((b) => (b as { text: string }).text)
		.join("");
}

/** Turn the learner's words into notes with their teacher model and save
 *  them. Throws PreferencesError (files untouched) on any failure. */
export async function generatePreferences(
	request: string,
	options: { engine?: PiEngine; signal?: AbortSignal } = {},
): Promise<PreferencesView> {
	const words = request.trim().slice(0, REQUEST_MAX_CHARS);
	if (!words) throw new PreferencesError("Say or type something about how you like to learn first.");
	let engine = options.engine;
	if (!engine) {
		const spec = resolveRoleSpec("teacher", stores.settingsStore.readSettings());
		if (!spec) throw new PreferencesError("Set up your models first.");
		engine = piEngineForSpec(spec, false);
	}
	const notes = parsePreferenceNotes(await complete(engine, words, options.signal));
	writeAll(words, notes);
	return readPreferences();
}

/** Back to the built-in prompts alone. */
export function clearPreferences(): void {
	fs.rmSync(FILES.preferencesDir, { recursive: true, force: true });
}
