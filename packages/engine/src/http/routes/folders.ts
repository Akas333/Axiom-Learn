import { stores } from "../../server/index.ts";

/** The sidebar's folders. GET lists them; POST { name, parentId? } makes
 *  one — nested inside parentId when it names an existing folder. */
export async function GET() {
	return Response.json({ folders: stores.chatStore.listFolders() });
}

export async function POST(req: Request) {
	const body = (await req.json().catch(() => null)) as { name?: unknown; parentId?: unknown } | null;
	if (typeof body?.name !== "string" || body.name.trim() === "") {
		return Response.json({ error: "name must be a non-empty string" }, { status: 400 });
	}
	const parentId = typeof body.parentId === "string" && stores.chatStore.listFolders().some((f) => f.id === body.parentId) ? body.parentId : undefined;
	return Response.json({ folder: stores.chatStore.createFolder(body.name.trim(), parentId ? { parentId } : {}) });
}
