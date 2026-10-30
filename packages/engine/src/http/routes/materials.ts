import { attachMaterial, MaterialError } from "../../server/index.ts";

/**
 * Attach material (2026-10-29): multipart POST with `file` and exactly
 * one of `chatId` / `folderId`. The original is stored, the chat gets a
 * material marker, and the transcription starts in the background — the
 * material card follows it through materials-changed events.
 */
export async function POST(req: Request) {
	const form = await req.formData().catch(() => null);
	const file = form?.get("file");
	if (!form || !(file instanceof File)) return Response.json({ error: "Send the file as multipart form field `file`." }, { status: 400 });
	const chatId = form.get("chatId");
	const folderId = form.get("folderId");
	try {
		const material = attachMaterial({
			name: file.name,
			mime: file.type,
			bytes: new Uint8Array(await file.arrayBuffer()),
			...(typeof chatId === "string" && chatId ? { chatId } : {}),
			...(typeof folderId === "string" && folderId ? { folderId } : {}),
		});
		return Response.json({ material });
	} catch (err) {
		if (err instanceof MaterialError) return Response.json({ error: err.message }, { status: err.status });
		throw err;
	}
}
