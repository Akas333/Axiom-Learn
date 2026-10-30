/**
 * The learner's preference layer (onboarding): what they said about how
 * they like to learn, and the per-agent notes their model wrote from it.
 *
 *   GET    → 200 {request, notes}
 *   PUT    {text} → 200 {request, notes} | 400 {error}  (files untouched on error)
 *   DELETE → 200 {request: "", notes: {...""}}          (built-in prompts only)
 */

import { clearPreferences, generatePreferences, PreferencesError, readPreferences } from "../../server/index.ts";

export async function GET() {
	return Response.json(readPreferences(), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
	let body: { text?: unknown };
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}
	if (typeof body.text !== "string") return Response.json({ error: "text is required" }, { status: 400 });
	try {
		return Response.json(await generatePreferences(body.text, { signal: req.signal }));
	} catch (error) {
		const message = error instanceof PreferencesError ? error.message : "The preferences could not be saved. Your tutor keeps its default prompts.";
		return Response.json({ error: message }, { status: 400 });
	}
}

export async function DELETE() {
	clearPreferences();
	return Response.json(readPreferences());
}
