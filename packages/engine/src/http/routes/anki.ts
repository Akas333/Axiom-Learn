/**
 * GET /api/anki — whether AnkiConnect answers, plus the last sync.
 * POST /api/anki/sync — push the graph into the deck and read the review
 * history back now. Thin transport over server/anki.ts.
 */
import { ankiStatus, effectiveSettings, syncAnki } from "../../server/index.ts";

export async function GET() {
	return Response.json(await ankiStatus());
}

export async function POST() {
	if (!effectiveSettings().anki.enabled) {
		return Response.json({ error: "Turn on the Anki sync in Settings first." }, { status: 409 });
	}
	const result = await syncAnki();
	return Response.json(result, { status: result.ok ? 200 : 502 });
}
