import { getChat, readableMaterials } from "../../server/index.ts";

/** Everything a chat can read: its own attachments plus its folders'. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (!getChat(id)) return Response.json({ error: "Not found" }, { status: 404 });
	return Response.json({ materials: readableMaterials(id) });
}
