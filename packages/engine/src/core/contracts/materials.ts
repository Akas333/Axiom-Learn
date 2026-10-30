/**
 * Materials (2026-10-29): images and PDFs the learner attaches to a chat or
 * a course folder — textbook pages, coaching notes, problem sheets. Each is
 * transcribed in full (prose verbatim, math as LaTeX, figures described,
 * problems marked with their source numbers), the learner can correct the
 * text, and the agents read it as the lesson's source and problem bank.
 * Stored at data/materials/<id>/ (the original + material.json).
 */

export type MaterialStatus = "extracting" | "ready" | "failed";

export interface MaterialRecord {
	id: string;
	/** The file's name as uploaded. */
	name: string;
	mime: string;
	/** Attached to one chat… */
	chatId?: string;
	/** …or to a folder (a course: every chat in it can read it). */
	folderId?: string;
	status: MaterialStatus;
	/** The transcription. PDF pages are separated by `<!-- page N -->`. */
	markdown: string;
	/** Pages transcribed so far / in total (progress). */
	pagesDone?: number;
	pageCount?: number;
	error?: string;
	createdAt: string;
	/** Set when the learner corrected the text. */
	editedAt?: string;
}

/** What can be uploaded. */
export const MATERIAL_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
export const MATERIAL_MAX_BYTES = 25 * 1024 * 1024;
/** A transcription up to this size rides the transcript whole; a longer
 *  one arrives as its contents, read on demand (material_read). */
export const MATERIAL_INLINE_CHARS = 12_000;
/** The most a single material_read returns. */
export const MATERIAL_READ_CAP = 24_000;

export function isMaterialMime(mime: string): mime is (typeof MATERIAL_MIME_TYPES)[number] {
	return (MATERIAL_MIME_TYPES as readonly string[]).includes(mime);
}

const PAGE_MARK = /^<!-- page (\d+) -->$/;

/** The page marker the transcription carries between PDF pages. */
export function materialPageMark(page: number): string {
	return `<!-- page ${page} -->`;
}

/** The headings of a transcription with the page each sits on — the
 *  contents a long material arrives as. */
export function materialContents(markdown: string): Array<{ heading: string; page: number | null }> {
	const out: Array<{ heading: string; page: number | null }> = [];
	let page: number | null = null;
	for (const line of markdown.split("\n")) {
		const mark = PAGE_MARK.exec(line.trim());
		if (mark) {
			page = Number(mark[1]);
			continue;
		}
		const heading = /^(#{1,4})\s+(.+)$/.exec(line);
		if (heading) out.push({ heading: `${heading[1]} ${heading[2]!.trim()}`, page });
	}
	return out;
}

/** The model-facing text of a material marker: the whole transcription
 *  when it is short, its contents otherwise, a status line while it is
 *  still being transcribed. */
export function materialMarkerText(record: MaterialRecord): string {
	const head = `Attached material [${record.id}]: ${record.name}`;
	if (record.status === "extracting") {
		return `${head} — still being transcribed (${record.pagesDone ?? 0}/${record.pageCount ?? "?"} pages). It becomes readable with material_read when it is ready.`;
	}
	if (record.status === "failed") {
		return `${head} — the transcription failed (${record.error ?? "unknown error"}). Ask him to re-upload it or describe it.`;
	}
	const corrected = record.editedAt ? " (corrected by the learner)" : "";
	if (record.markdown.length <= MATERIAL_INLINE_CHARS) {
		return `${head}${corrected}\n\n${record.markdown}`;
	}
	const contents = materialContents(record.markdown)
		.map((c) => `- ${c.heading}${c.page !== null ? ` (p. ${c.page})` : ""}`)
		.join("\n");
	return (
		`${head}${corrected} — ${record.pageCount ?? "several"} pages, too long to show whole. Read it with ` +
		`material_read (by pages or heading) and material_search.\n\nContents:\n${contents || "(no headings found — read it by pages)"}`
	);
}

/** One slice of a transcription: by page range ("3", "2-5") or by the
 *  section under a heading (case-insensitive substring match). */
export function materialSlice(markdown: string, opts: { pages?: string; heading?: string }): string {
	if (opts.pages) {
		const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(opts.pages.trim());
		if (!m) return "";
		const from = Number(m[1]);
		const to = Number(m[2] ?? m[1]);
		const out: string[] = [];
		let page: number | null = null;
		for (const line of markdown.split("\n")) {
			const mark = PAGE_MARK.exec(line.trim());
			if (mark) page = Number(mark[1]);
			if (page !== null && page >= from && page <= to) out.push(line);
		}
		return out.join("\n").trim();
	}
	if (opts.heading) {
		const lines = markdown.split("\n");
		const needle = opts.heading.toLowerCase().replace(/^#+\s*/, "");
		const at = lines.findIndex((l) => /^#{1,4}\s/.test(l) && l.toLowerCase().includes(needle));
		if (at === -1) return "";
		const level = /^(#+)/.exec(lines[at]!)![1]!.length;
		const out = [lines[at]!];
		for (const line of lines.slice(at + 1)) {
			const h = /^(#+)\s/.exec(line);
			if (h && h[1]!.length <= level) break;
			out.push(line);
		}
		return out.join("\n").trim();
	}
	return markdown;
}
