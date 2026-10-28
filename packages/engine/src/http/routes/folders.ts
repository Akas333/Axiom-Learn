import { stores } from "../../server/index.ts";

/** The sidebar's folders. GET lists them; POST { name } makes one. */
export async function GET() {
	return Response.json({ folders: stores.chatStore.listFolders() });
}

export async function POST(req: Request) {
	const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
	if (typeof body?.name !== "string" || body.name.trim() === "") {
		return Response.json({ error: "name must be a non-empty string" }, { status: 400 });
	}
	return Response.json({ folder: stores.chatStore.createFolder(body.name.trim()) });
}
