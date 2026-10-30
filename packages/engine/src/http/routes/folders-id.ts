import { stores } from "../../server/index.ts";

/** Rename a folder: PUT { name }. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
	if (typeof body?.name !== "string" || body.name.trim() === "") {
		return Response.json({ error: "name must be a non-empty string" }, { status: 400 });
	}
	const folder = stores.chatStore.renameFolder(id, body.name.trim());
	if (!folder) return Response.json({ error: "Not found" }, { status: 404 });
	return Response.json({ folder });
}

/** Delete a folder. Its sessions are kept and moved out of the folder. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (!stores.chatStore.deleteFolder(id)) return Response.json({ error: "Not found" }, { status: 404 });
	return Response.json({ ok: true });
}
