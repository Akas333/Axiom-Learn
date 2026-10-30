/**
 * The material store (2026-10-29): data/materials/<id>/ holds the uploaded
 * original (original.<ext>) and material.json (the MaterialRecord — status,
 * transcription, the learner's corrections). One directory per material;
 * nothing indexes them but the directory listing.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { PATHS } from "../../config.ts";
import { emit } from "../core/events.ts";
import type { MaterialStore } from "../core/ports.ts";
import type { MaterialRecord } from "../core/contracts.ts";

const EXT: Record<string, string> = {
	"application/pdf": "pdf",
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
};

function materialsDir(): string {
	return path.join(PATHS.data, "materials");
}

function dirOf(id: string): string {
	// Ids are ours (mat_<base36>_<hex>); refuse anything else outright.
	if (!/^mat_[a-z0-9]+_[a-f0-9]+$/.test(id)) throw new Error(`invalid material id: ${id}`);
	return path.join(materialsDir(), id);
}

function recordFile(id: string): string {
	return path.join(dirOf(id), "material.json");
}

function changed(record: MaterialRecord): void {
	emit("materials-changed", {
		id: record.id,
		...(record.chatId ? { chatId: record.chatId } : {}),
		...(record.folderId ? { folderId: record.folderId } : {}),
	});
}

function writeRecord(record: MaterialRecord): void {
	fs.mkdirSync(dirOf(record.id), { recursive: true });
	const file = recordFile(record.id);
	const tmp = `${file}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(record, null, "\t"), "utf-8");
	fs.renameSync(tmp, file);
}

function createMaterial(input: { name: string; mime: string; bytes: Uint8Array; chatId?: string; folderId?: string }): MaterialRecord {
	const record: MaterialRecord = {
		id: `mat_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
		name: input.name.trim() || "material",
		mime: input.mime,
		...(input.chatId ? { chatId: input.chatId } : {}),
		...(input.folderId ? { folderId: input.folderId } : {}),
		status: "extracting",
		markdown: "",
		createdAt: new Date().toISOString(),
	};
	fs.mkdirSync(dirOf(record.id), { recursive: true });
	fs.writeFileSync(originalPath(record.id, record.mime), input.bytes);
	writeRecord(record);
	changed(record);
	return record;
}

function originalPath(id: string, mime: string): string {
	return path.join(dirOf(id), `original.${EXT[mime] ?? "bin"}`);
}

function getMaterial(id: string): MaterialRecord | null {
	try {
		return JSON.parse(fs.readFileSync(recordFile(id), "utf-8")) as MaterialRecord;
	} catch {
		return null;
	}
}

function listMaterials(filter: { chatId?: string; folderIds?: readonly string[] } = {}): MaterialRecord[] {
	let ids: string[];
	try {
		ids = fs.readdirSync(materialsDir());
	} catch {
		return [];
	}
	return ids
		.map((id) => (/^mat_/.test(id) ? getMaterial(id) : null))
		.filter((r): r is MaterialRecord => r !== null)
		.filter((r) => {
			if (filter.chatId === undefined && filter.folderIds === undefined) return true;
			return (filter.chatId !== undefined && r.chatId === filter.chatId) || (r.folderId !== undefined && (filter.folderIds ?? []).includes(r.folderId));
		})
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function updateMaterial(id: string, patch: Partial<Omit<MaterialRecord, "id" | "createdAt">>): MaterialRecord | null {
	const record = getMaterial(id);
	if (!record) return null;
	const next = { ...record, ...patch };
	writeRecord(next);
	changed(next);
	return next;
}

function deleteMaterial(id: string): boolean {
	const record = getMaterial(id);
	if (!record) return false;
	fs.rmSync(dirOf(id), { recursive: true, force: true });
	changed(record);
	return true;
}

export const materialStore: MaterialStore = {
	createMaterial,
	getMaterial,
	listMaterials,
	updateMaterial,
	deleteMaterial,
	originalPath,
};
