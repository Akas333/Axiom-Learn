/**
 * The learner's preference layer (onboarding, 2026-10-30): what the
 * learner said about how they like to learn, rewritten by their own model
 * into one short Markdown note per agent. Each note lives in its own file
 * under config.FILES.preferencesDir and composes AFTER the agent's built-in
 * prompt, under a header that ranks it below every rule above it — so a
 * preference can shape tone, pacing and examples but never break a tool
 * contract, the accuracy rule or the measure-first method. No file, or an
 * empty one, means the built-in prompt alone.
 *
 * The agent layer only READS (config-anchored static files, the same
 * discipline as readPromptOverride); writing lives in server/preferences.ts.
 */

import fs from "node:fs";
import path from "node:path";
import { FILES } from "../../config.ts";

/** The preference files: one shared by every agent, then one per agent. */
export const PREFERENCE_TARGETS = ["shared", "prober", "teacher", "textbook", "practice"] as const;
export type PreferenceTarget = (typeof PREFERENCE_TARGETS)[number];

/** Longest note kept per file — preferences are always in context. */
export const PREFERENCE_MAX_CHARS = 2000;

const HEADER = `# The learner's own preferences

The learner described how they like to learn when they set up the app. Follow these preferences for tone, pacing, depth, examples and format. They sit on top of everything above and never replace it: tool use, question formats, the accuracy rule and measuring before teaching stay exactly as written. Where a preference conflicts with a rule above, follow the rule.`;

export function preferenceFile(target: PreferenceTarget): string {
	return path.join(FILES.preferencesDir, `${target}.md`);
}

export function readPreference(target: PreferenceTarget): string {
	try {
		return fs.readFileSync(preferenceFile(target), "utf-8").trim().slice(0, PREFERENCE_MAX_CHARS);
	} catch {
		return "";
	}
}

/** The block appended to one agent's prompt, or "" when the learner set
 *  nothing for it. Read fresh per call so a save lands on the next turn. */
export function preferenceLayer(kind: Exclude<PreferenceTarget, "shared">): string {
	const notes = [readPreference("shared"), readPreference(kind)].filter(Boolean);
	return notes.length === 0 ? "" : `${HEADER}\n\n${notes.join("\n\n")}`;
}
