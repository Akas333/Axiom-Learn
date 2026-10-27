/**
 * ANKI: the knowledge graph as an Anki deck, and Anki's review history as
 * spaced-review evidence.
 *
 * Two directions, both through the AnkiConnect add-on (server/anki.ts):
 *   - push (after each session): one note per graph node, front = the
 *     node's name, back = its statement. The node id rides in a hidden
 *     field, so a note is found again even after the learner moves it to
 *     another deck.
 *   - pull (before each new session): every review of those cards becomes
 *     a ReviewEvent (core/review.ts), so the FSRS memory state the tutor
 *     reads covers flashcard reviews as well as practice problems.
 *
 * Browser-safe: pure logic + types, no node imports.
 */

import type { ReviewEvent, ReviewGrade } from "./review.ts";

// ─── settings ────────────────────────────────────────────────────────────────

export const ANKI_DEFAULT_DECK = "Axiom Learn";
export const ANKI_DEFAULT_URL = "http://127.0.0.1:8765";
/** The note type the push creates and the pull looks for. */
export const ANKI_NOTE_TYPE = "Axiom Learn Proposition";
const DECK_MAX = 120;

export interface AnkiSettings {
	enabled?: boolean;
	/** Deck new notes go into. */
	deck?: string;
	/** AnkiConnect address (loopback only). */
	url?: string;
}

export interface ResolvedAnkiSettings {
	enabled: boolean;
	deck: string;
	url: string;
}

export function resolveAnki(raw: AnkiSettings | undefined): ResolvedAnkiSettings {
	return {
		enabled: raw?.enabled === true,
		deck: raw?.deck?.trim() || ANKI_DEFAULT_DECK,
		url: raw?.url?.trim() || ANKI_DEFAULT_URL,
	};
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** AnkiConnect runs on the learner's machine; the server never calls
 *  anything else through this setting. */
export function isAllowedAnkiUrl(url: string): boolean {
	try {
		const u = new URL(url);
		return (u.protocol === "http:" || u.protocol === "https:") && LOOPBACK.has(u.hostname) && !u.username && !u.password;
	} catch {
		return false;
	}
}

/** Deck names: Anki uses "::" for subdecks; quotes would break searches. */
function validDeck(deck: string): boolean {
	return deck.length > 0 && deck.length <= DECK_MAX && !/["\n\r\t]/.test(deck);
}

/** Read-side sanitizer: lenient, drops anything malformed. */
export function sanitizeAnki(raw: unknown): AnkiSettings | undefined {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
	const r = raw as Record<string, unknown>;
	const out: AnkiSettings = {};
	if (typeof r.enabled === "boolean") out.enabled = r.enabled;
	if (typeof r.deck === "string" && validDeck(r.deck.trim())) out.deck = r.deck.trim();
	if (typeof r.url === "string" && isAllowedAnkiUrl(r.url.trim())) out.url = r.url.trim();
	return out;
}

/** Write-side parser: strict (a bad value is a 400 with the reason). */
export function parseAnkiBody(body: unknown): { ok: true; settings: AnkiSettings } | { ok: false; error: string } {
	if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Invalid JSON body" };
	const raw = body as Record<string, unknown>;
	const out: AnkiSettings = {};
	if (raw.enabled !== undefined) {
		if (typeof raw.enabled !== "boolean") return { ok: false, error: "enabled must be a boolean" };
		out.enabled = raw.enabled;
	}
	if (raw.deck !== undefined && raw.deck !== null && raw.deck !== "") {
		if (typeof raw.deck !== "string" || !validDeck(raw.deck.trim())) {
			return { ok: false, error: `deck must be 1–${DECK_MAX} characters without quotes or tabs` };
		}
		out.deck = raw.deck.trim();
	}
	if (raw.url !== undefined && raw.url !== null && raw.url !== "") {
		if (typeof raw.url !== "string" || !isAllowedAnkiUrl(raw.url.trim())) {
			return { ok: false, error: "url must be an http address on this computer (localhost or 127.0.0.1)" };
		}
		out.url = raw.url.trim();
	}
	return { ok: true, settings: out };
}

// ─── the note type ───────────────────────────────────────────────────────────

export const ANKI_FIELDS = ["Name", "Statement", "NodeId"] as const;
export type AnkiNoteFields = Record<(typeof ANKI_FIELDS)[number], string>;

export const ANKI_CARD_TEMPLATE = {
	Name: "Recall",
	Front: '<div class="axiom-name">{{Name}}</div>\n<div class="axiom-ask">State this proposition.</div>',
	Back: '{{FrontSide}}\n<hr id="answer">\n<div class="axiom-statement">{{Statement}}</div>',
};

export const ANKI_CSS = `.card { font-family: -apple-system, system-ui, sans-serif; font-size: 20px; line-height: 1.5; text-align: left; max-width: 40em; margin: 0 auto; padding: 1em; }
.axiom-name { font-size: 1.3em; font-weight: 600; }
.axiom-ask { margin-top: .4em; font-size: .8em; opacity: .6; }
.axiom-statement { margin-top: .4em; }`;

function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Graph text → Anki field HTML. Anki renders MathJax with \( \) and \[ \],
 * not dollars, so TeX delimiters are rewritten; everything else is escaped
 * and newlines become line breaks.
 */
export function toAnkiHtml(text: string): string {
	const out = escapeHtml(text)
		.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => `\\[${tex}\\]`)
		.replace(/(^|[^\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g, (_m, pre: string, tex: string) => `${pre}\\(${tex}\\)`);
	return out.replace(/\n/g, "<br>");
}

export function ankiFieldsFor(node: { id: string; name: string; statement: string }): AnkiNoteFields {
	return { Name: toAnkiHtml(node.name), Statement: toAnkiHtml(node.statement), NodeId: node.id };
}

/** A stable fingerprint of what the push last wrote for a node. */
export function fieldsHash(fields: AnkiNoteFields): string {
	const text = `${fields.Name}\u0000${fields.Statement}`;
	let h = 5381;
	for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
	return (h >>> 0).toString(36);
}

// ─── the push plan ───────────────────────────────────────────────────────────

export interface AnkiExistingNote {
	noteId: number;
	nodeId: string;
}

export interface AnkiPushPlan {
	/** Nodes with no note yet. A node pushed before whose note is gone was
	 *  deleted by the learner and is not added back. */
	add:{ nodeId: string; fields: AnkiNoteFields }[];
	/** Notes whose graph text changed since the last push. A learner's own
	 *  edits in Anki are left alone until the graph text changes again. */
	update: { nodeId: string; noteId: number; fields: AnkiNoteFields }[];
}

export function planAnkiPush(
	nodes: readonly { id: string; name: string; statement: string }[],
	existing: readonly AnkiExistingNote[],
	/** nodeId → fieldsHash the last push wrote. */
	pushed: Readonly<Record<string, string>>,
): AnkiPushPlan {
	const noteOf = new Map<string, number>();
	for (const e of existing) if (!noteOf.has(e.nodeId)) noteOf.set(e.nodeId, e.noteId);
	const plan: AnkiPushPlan = { add: [], update: [] };
	for (const node of nodes) {
		const fields = ankiFieldsFor(node);
		const noteId = noteOf.get(node.id);
		if (noteId === undefined) {
			// Pushed before but gone now: the learner deleted it in Anki.
			if (pushed[node.id] === undefined) plan.add.push({ nodeId: node.id, fields });
		} else if (pushed[node.id] !== fieldsHash(fields)) plan.update.push({ nodeId: node.id, noteId, fields });
	}
	return plan;
}

// ─── the pull: reviews → review events ───────────────────────────────────────

/** One revlog row as AnkiConnect's getReviewsOfCards returns it. */
export interface AnkiRevlogEntry {
	/** Epoch ms of the review (the revlog id). */
	id: number;
	/** 1 again, 2 hard, 3 good, 4 easy; 0 for a manual reschedule. */
	ease: number;
	/** 0 learn, 1 review, 2 relearn, 3 filtered, 4 manual, 5 rescheduled. */
	type: number;
}

/** The demand mode flashcard reviews count as (core/review.ts strongModes). */
export const ANKI_REVIEW_MODE = "flashcard";

function localDay(ms: number): string {
	const d = new Date(ms);
	return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * A card's revlog → review events for its node. Only the first review of
 * each day counts (the FSRS convention): the same-day learning steps after
 * a lapse say little about long-term memory, and counting them would let
 * one cramming session look like many reviews.
 */
export function ankiReviewEvents(nodeId: string, revlog: readonly AnkiRevlogEntry[]): ReviewEvent[] {
	const seen = new Set<string>();
	const out: ReviewEvent[] = [];
	for (const r of [...revlog].sort((a, b) => a.id - b.id)) {
		if (r.ease < 1 || r.ease > 4 || r.type > 3 || !Number.isFinite(r.id)) continue;
		const day = localDay(r.id);
		if (seen.has(day)) continue;
		seen.add(day);
		out.push({ nodeId, at: r.id, grade: r.ease as ReviewGrade, session: `anki:${day}`, mode: ANKI_REVIEW_MODE });
	}
	return out;
}

/** What the tutor is told about a node's flashcard. */
export interface AnkiCardStat {
	reviews: number;
	lapses: number;
	/** Current interval in days (0 while still learning). */
	intervalDays: number;
	suspended: boolean;
	/** Epoch ms of the most recent "again". */
	lastAgainAt?: number;
}

export function ankiCardStat(card: { lapses?: number; reps?: number; interval?: number; queue?: number }, revlog: readonly AnkiRevlogEntry[]): AnkiCardStat {
	const again = revlog.filter((r) => r.ease === 1).map((r) => r.id);
	return {
		reviews: revlog.filter((r) => r.ease >= 1 && r.ease <= 4).length,
		lapses: Math.max(0, card.lapses ?? 0),
		intervalDays: Math.max(0, card.interval ?? 0),
		suspended: card.queue === -1,
		...(again.length > 0 ? { lastAgainAt: Math.max(...again) } : {}),
	};
}

/** Several cards for one node (a learner may duplicate a note): merge. */
export function mergeCardStats(a: AnkiCardStat, b: AnkiCardStat): AnkiCardStat {
	const lastAgainAt = Math.max(a.lastAgainAt ?? 0, b.lastAgainAt ?? 0);
	return {
		reviews: a.reviews + b.reviews,
		lapses: a.lapses + b.lapses,
		intervalDays: Math.min(a.intervalDays, b.intervalDays),
		suspended: a.suspended && b.suspended,
		...(lastAgainAt > 0 ? { lastAgainAt } : {}),
	};
}

const DAY_MS = 86_400_000;

/** The flashcard half of a memory note, e.g. "Anki: 9 reviews, 3 lapses,
 *  interval 4d, last 'again' 2 days ago". */
export function ankiNote(stat: AnkiCardStat | undefined, now: number): string | undefined {
	if (!stat) return undefined;
	if (stat.reviews === 0) return "Anki: card not reviewed yet";
	const parts = [`${stat.reviews} ${stat.reviews === 1 ? "review" : "reviews"}`];
	parts.push(`${stat.lapses} ${stat.lapses === 1 ? "lapse" : "lapses"}`);
	parts.push(stat.intervalDays > 0 ? `interval ${stat.intervalDays}d` : "still learning");
	if (stat.lastAgainAt !== undefined) {
		const days = Math.floor((now - stat.lastAgainAt) / DAY_MS);
		parts.push(`last forgotten ${days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}`);
	}
	if (stat.suspended) parts.push("suspended");
	if (stat.lapses >= 3) parts.push("forgotten often");
	return `Anki: ${parts.join(", ")}`;
}
