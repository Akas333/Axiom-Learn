/**
 * Materials, server side (2026-10-29): attaching (store the original,
 * mark the chat, start the transcription), the transcription run itself,
 * and the two reads the agents need — which materials a chat may read
 * (its own plus its folder's and every ancestor folder's), and the
 * per-turn refresh that puts each material marker's CURRENT text in front
 * of the model (status, transcription, the learner's corrections).
 */
import { extractMaterial } from "../agent/subagents/material-extractor.ts";
import { piEngineForSpec } from "../agent/models.ts";
import { emit } from "../core/events.ts";
import { resolveRoleSpec } from "../core/settings-resolution.ts";
import { isMaterialMime, materialMarkerText, MATERIAL_MAX_BYTES, type MaterialRecord } from "../core/contracts.ts";
import { newMaterialMessage, type LhMarkerMessage, type LhMessage } from "../core/native-messages.ts";
import { stores } from "./stores.ts";
import { isTurnRunning } from "./turn-liveness.ts";

export class MaterialError extends Error {
	constructor(message: string, readonly status: number) {
		super(message);
	}
}

/** The folder and every folder above it. */
export function folderChain(folderId: string | undefined): string[] {
	const folders = stores.chatStore.listFolders();
	const chain: string[] = [];
	let at = folderId;
	while (at && !chain.includes(at)) {
		chain.push(at);
		at = folders.find((f) => f.id === at)?.parentId;
	}
	return chain;
}

/** What a chat may read: materials attached to it, to its folder, or to
 *  any folder above (a course's materials reach every concept chat). */
export function readableMaterials(chatId: string): MaterialRecord[] {
	const record = stores.chatStore.getChat(chatId);
	return stores.materialStore.listMaterials({ chatId, folderIds: folderChain(record?.folderId) });
}

/** Material ids a course folder's chats can read (course_open seeds them). */
export function materialIdsForFolder(folderId: string): string[] {
	return stores.materialStore.listMaterials({ folderIds: folderChain(folderId) }).map((m) => m.id);
}

/** The material markers' text as it stands NOW — applied to the turn's
 *  messages before the agent sees them (never persisted: the record keeps
 *  the attach-time snapshot). */
export function refreshMaterialMarkers(messages: readonly LhMessage[]): LhMessage[] {
	return messages.map((m) => {
		const marker = m as LhMarkerMessage;
		if (marker.role !== "custom" || marker.customType !== "material") return m;
		const id = (marker.details as { materialId?: unknown } | undefined)?.materialId;
		const record = typeof id === "string" ? stores.materialStore.getMaterial(id) : null;
		if (!record) return { ...marker, content: `${marker.content.split("\n")[0]} — this material was deleted.` } as LhMessage;
		return { ...marker, content: materialMarkerText(record) } as LhMessage;
	});
}

/** Attach an upload: store it, mark the chat (when it goes to a chat),
 *  start the transcription. Throws MaterialError with an HTTP status. */
export function attachMaterial(input: { name: string; mime: string; bytes: Uint8Array; chatId?: string; folderId?: string }): MaterialRecord {
	if (!isMaterialMime(input.mime)) throw new MaterialError("Only PDF, PNG, JPEG and WebP files can be attached.", 415);
	if (input.bytes.byteLength > MATERIAL_MAX_BYTES) throw new MaterialError("The file is larger than 25 MB.", 413);
	if (!input.chatId === !input.folderId) throw new MaterialError("Attach to exactly one of chatId or folderId.", 400);
	if (input.chatId) {
		const chat = stores.chatStore.getChat(input.chatId);
		if (!chat) throw new MaterialError("Chat not found.", 404);
		if (isTurnRunning(input.chatId)) throw new MaterialError("A turn is running in this session — attach when it finishes.", 409);
	}
	if (input.folderId && !stores.chatStore.listFolders().some((f) => f.id === input.folderId)) {
		throw new MaterialError("Folder not found.", 404);
	}
	const record = stores.materialStore.createMaterial(input);
	if (input.chatId) {
		const chat = stores.chatStore.getChat(input.chatId)!;
		stores.chatStore.saveMessages(input.chatId, [...chat.messages, newMaterialMessage(record)]);
		emit("record-changed", { chatId: input.chatId });
	}
	void runExtraction(record.id);
	return record;
}

/** Transcribe one material on the vision model (the pdf-reader's slot). */
export async function runExtraction(id: string): Promise<void> {
	const record = stores.materialStore.getMaterial(id);
	if (!record) return;
	const spec = resolveRoleSpec("pdfReader", stores.settingsStore.readSettings());
	if (!spec) {
		stores.materialStore.updateMaterial(id, { status: "failed", error: "No vision model is set up — choose one in Settings → Models." });
		return;
	}
	let lastWrite = 0;
	try {
		const result = await extractMaterial(stores.materialStore.originalPath(id, record.mime), record.mime, {
			engine: piEngineForSpec(spec),
			onPage: (done, total, markdown) => {
				// Progress writes, throttled: the card shows pages as they land.
				if (Date.now() - lastWrite < 1500 && done < total) return;
				lastWrite = Date.now();
				stores.materialStore.updateMaterial(id, { pagesDone: done, pageCount: total, markdown });
			},
		});
		stores.materialStore.updateMaterial(id, { status: "ready", markdown: result.markdown, pageCount: result.pageCount, pagesDone: result.pageCount });
	} catch (err) {
		console.error(`[material ${id}] transcription failed:`, err);
		stores.materialStore.updateMaterial(id, { status: "failed", error: err instanceof Error ? err.message : String(err) });
	}
}
