/**
 * Export and import of the learner's data folder (2026-10-30): everything
 * stays local, and the only way data leaves this computer is a .tysa file
 * the learner saves themselves, encrypted with their passphrase
 * (core/data-bundle.ts).
 *
 * EXPORT takes the learner's own records: chats, the knowledge graph,
 * folders, materials, jobs, settings and prompt edits. Left out: provider
 * keys and sign-in credentials (they live beside auth.json, outside the data
 * folder, and any stray copy is skipped by name), the question bank (shared
 * reference data, large, set up separately), debug recordings, earlier
 * import backups and temp files.
 *
 * IMPORT replaces the data folder, apart from this machine's question bank.
 * What was there first moves to <data>/.backups/<time>/, so an import never
 * loses anything; a failed write puts it back. It refuses while a lesson, job or graph run is going, since
 * those write to the files being replaced.
 */
import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "../../config.ts";
import { BundleError, openBundle, sealBundle, type BundleFile } from "../core/data-bundle.ts";
import { extractionStatuses } from "../agent/subagents/extraction.ts";
import { isTurnRunning } from "./turn-liveness.ts";
import { stores } from "./stores.ts";

export const BACKUPS_DIR = ".backups";

/** Top-level folders that never travel. */
const SKIPPED_DIRS = new Set([BACKUPS_DIR, "debug", "question-bank"]);
/** Top-level folders an import leaves where they are: earlier backups, and
 *  this machine's own question bank. A bundle may not contain them. */
const KEPT_ON_IMPORT = new Set([BACKUPS_DIR, "question-bank"]);

/** Files that never travel, wherever they sit: secrets and scratch files. */
function skippedFile(name: string): boolean {
	return (
		name === "auth.json" ||
		name.includes("credentials.json") ||
		name === ".DS_Store" ||
		name.endsWith(".tmp") ||
		name.includes(".tmp-")
	);
}

/** Every exportable file under the data folder, sorted by path. */
export function collectDataFiles(root = dataRoot()): BundleFile[] {
	const files: BundleFile[] = [];
	const walk = (dir: string, rel: string) => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const relPath = rel ? `${rel}/${entry.name}` : entry.name;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!rel && SKIPPED_DIRS.has(entry.name)) continue;
				walk(full, relPath);
			} else if (entry.isFile() && !skippedFile(entry.name)) {
				files.push({ path: relPath, data: fs.readFileSync(full) });
			}
		}
	};
	walk(root, "");
	return files.sort((a, b) => a.path.localeCompare(b.path));
}

export interface DataSummary {
	files: number;
	bytes: number;
	chats: number;
	materials: number;
}

export function summarize(files: readonly BundleFile[]): DataSummary {
	const materials = new Set<string>();
	let chats = 0;
	let bytes = 0;
	for (const f of files) {
		bytes += f.data.length;
		if (/^chats\/[^/]+\.json$/.test(f.path)) chats++;
		const m = /^materials\/([^/]+)\//.exec(f.path);
		if (m?.[1]) materials.add(m[1]);
	}
	return { files: files.length, bytes, chats, materials: materials.size };
}

/** What would go into an export right now. */
export function dataSummary(): DataSummary {
	return summarize(collectDataFiles());
}

/** The encrypted export of the whole data folder. */
export function exportData(passphrase: string): { bundle: Buffer; summary: DataSummary } {
	const files = collectDataFiles();
	return { bundle: sealBundle(files, passphrase), summary: summarize(files) };
}

/** Something is writing to the data folder: a lesson turn, a background
 *  job or a knowledge-graph run. */
export function dataBusy(): boolean {
	if (extractionStatuses().length > 0) return true;
	for (const chat of stores.chatStore.listChats()) {
		if (isTurnRunning(chat.id)) return true;
		if (stores.jobStore.listJobs(chat.id).some((job) => job.status === "running")) return true;
	}
	return false;
}

export class DataBusyError extends Error {
	constructor() {
		super("Wait for running lessons and background work to finish, then import again.");
		this.name = "DataBusyError";
	}
}

export interface ImportResult extends DataSummary {
	/** Where the previous data went, relative to the data folder; null when
	 *  the folder was empty. */
	backup: string | null;
	exportedAt: string;
}

/**
 * Replace the data folder with a bundle's contents. Decrypts and checks the
 * whole bundle before touching the disk, so a wrong passphrase changes
 * nothing.
 */
export function importData(bundle: Buffer, passphrase: string, root = dataRoot(), now = new Date()): ImportResult {
	const { files, createdAt } = openBundle(bundle, passphrase);
	if (files.some((f) => KEPT_ON_IMPORT.has(f.path.split("/")[0] ?? ""))) {
		throw new BundleError("The bundle contains a reserved folder.", "unsafe_path");
	}
	if (dataBusy()) throw new DataBusyError();

	fs.mkdirSync(root, { recursive: true });
	const current = fs.readdirSync(root).filter((name) => !KEPT_ON_IMPORT.has(name));
	let backup: string | null = null;
	if (current.length > 0) {
		backup = `${BACKUPS_DIR}/${now.toISOString().replace(/[:.]/g, "-")}`;
		const backupDir = path.join(root, backup);
		fs.mkdirSync(backupDir, { recursive: true });
		for (const name of current) fs.renameSync(path.join(root, name), path.join(backupDir, name));
	}

	try {
		for (const file of files) {
			const target = path.join(root, ...file.path.split("/"));
			// isSafeBundlePath already holds; this is the last line of defence.
			if (!target.startsWith(root + path.sep)) throw new BundleError(`Unsafe path in bundle: ${file.path}`, "unsafe_path");
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, file.data);
		}
	} catch (err) {
		// Put the previous data back exactly as it was.
		for (const name of fs.readdirSync(root)) {
			if (!KEPT_ON_IMPORT.has(name)) fs.rmSync(path.join(root, name), { recursive: true, force: true });
		}
		if (backup) {
			const backupDir = path.join(root, backup);
			for (const name of fs.readdirSync(backupDir)) fs.renameSync(path.join(backupDir, name), path.join(root, name));
			fs.rmSync(backupDir, { recursive: true, force: true });
		}
		throw err;
	}

	return { ...summarize(files), backup, exportedAt: createdAt };
}
