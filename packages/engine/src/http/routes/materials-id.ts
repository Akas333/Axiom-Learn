import { stores } from "../../server/index.ts";

/** One material: its status and transcription (GET), the learner's
 *  corrected text (PUT { markdown }), removal (DELETE — the chat's marker
 *  stays and tells the agent it is gone). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const material = safeGet(id);
	if (!material) return Response.json({ error: "Not found" }, { status: 404 });
	return Response.json({ material });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (!safeGet(id)) return Response.json({ error: "Not found" }, { status: 404 });
	const body = (await req.json().catch(() => null)) as { markdown?: unknown } | null;
	if (typeof body?.markdown !== "string" || body.markdown.trim() === "") {
		return Response.json({ error: "markdown must be a non-empty string" }, { status: 400 });
	}
	const material = stores.materialStore.updateMaterial(id, {
		markdown: body.markdown,
		status: "ready",
		editedAt: new Date().toISOString(),
	});
	return Response.json({ material });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (!safeGet(id) || !stores.materialStore.deleteMaterial(id)) return Response.json({ error: "Not found" }, { status: 404 });
	return Response.json({ ok: true });
}

/** Malformed ids read as unknown (the store refuses them). */
function safeGet(id: string) {
	try {
		return stores.materialStore.getMaterial(id);
	} catch {
		return null;
	}
}
