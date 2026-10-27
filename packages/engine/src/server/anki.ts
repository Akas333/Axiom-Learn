/**
 * The Anki bridge: talks to the AnkiConnect add-on (Anki's local HTTP API,
 * https://foosoft.net/projects/anki-connect/) to keep a deck of the
 * knowledge graph and to read the learner's flashcard reviews back.
 *
 *   push  — after each session (auto, debounced after turns and extraction
 *           runs settle) and on "Sync now": one note per graph node.
 *   pull  — before each new session and on "Sync now": every review of
 *           those cards, cached on disk so sessions started while Anki is
 *           closed still use the last known history.
 *
 * Pure decisions live in core/anki.ts. Off unless Settings → Anki enables it.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { PATHS } from "../../config.ts";
import {
	ANKI_CARD_TEMPLATE,
	ANKI_CSS,
	ANKI_FIELDS,
	ANKI_NOTE_TYPE,
	ankiCardStat,
	ankiReviewEvents,
	fieldsHash,
	isAllowedAnkiUrl,
	mergeCardStats,
	planAnkiPush,
	type AnkiCardStat,
	type AnkiExistingNote,
	type AnkiRevlogEntry,
	type ResolvedAnkiSettings,
} from "../core/anki.ts";
import { subscribe } from "../core/events.ts";
import type { ReviewEvent } from "../core/review.ts";
import { effectiveSettings, stores } from "./stores.ts";

// ─── AnkiConnect client ──────────────────────────────────────────────────────

export class AnkiUnavailableError extends Error {}

const ANKI_CONNECT_VERSION = 6;

async function invoke<T>(url: string, action: string, params: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<T> {
	if (!isAllowedAnkiUrl(url)) throw new AnkiUnavailableError("The AnkiConnect address must be on this computer.");
	let res: Response;
	try {
		res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action, version: ANKI_CONNECT_VERSION, params }),
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch {
		throw new AnkiUnavailableError("Anki isn't reachable. Open Anki and make sure the AnkiConnect add-on is installed.");
	}
	const body = (await res.json().catch(() => null)) as { result?: T; error?: string | null } | null;
	if (!body || typeof body !== "object" || !("result" in body)) {
		throw new AnkiUnavailableError("Something answered at the AnkiConnect address, but it isn't AnkiConnect.");
	}
	if (body.error) throw new Error(`AnkiConnect ${action}: ${body.error}`);
	return body.result as T;
}

const searchNoteType = `"note:${ANKI_NOTE_TYPE}"`;

// ─── local state (data/anki.json) ────────────────────────────────────────────

export interface AnkiSyncResult {
	at: number;
	ok: boolean;
	added?: number;
	updated?: number;
	/** Cards whose review history was read. */
	cards?: number;
	reviews?: number;
	error?: string;
}

interface AnkiState {
	/** nodeId → fieldsHash the last push wrote. */
	pushed: Record<string, string>;
	/** The last successful pull. */
	pull?: { at: number; events: ReviewEvent[]; cards: Record<string, AnkiCardStat> };
	lastSync?: AnkiSyncResult;
}

const STATE_FILE = path.join(PATHS.data, "anki.json");

function readState(): AnkiState {
	try {
		const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as Partial<AnkiState>;
		return {
			pushed: raw.pushed && typeof raw.pushed === "object" ? raw.pushed : {},
			...(raw.pull && Array.isArray(raw.pull.events) ? { pull: raw.pull } : {}),
			...(raw.lastSync ? { lastSync: raw.lastSync } : {}),
		};
	} catch {
		return { pushed: {} };
	}
}

function writeState(state: AnkiState): void {
	fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
	const tmp = `${STATE_FILE}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(state), "utf-8");
	fs.renameSync(tmp, STATE_FILE);
}

// ─── push: graph → deck ──────────────────────────────────────────────────────

async function ensureNoteType(url: string): Promise<void> {
	const models = await invoke<string[]>(url, "modelNames");
	if (models.includes(ANKI_NOTE_TYPE)) return;
	await invoke(url, "createModel", {
		modelName: ANKI_NOTE_TYPE,
		inOrderFields: [...ANKI_FIELDS],
		css: ANKI_CSS,
		cardTemplates: [ANKI_CARD_TEMPLATE],
	});
}

async function existingNotes(url: string): Promise<AnkiExistingNote[]> {
	const ids = await invoke<number[]>(url, "findNotes", { query: searchNoteType });
	if (ids.length === 0) return [];
	const infos = await invoke<({ noteId: number; fields: Record<string, { value: string }> } | null)[]>(url, "notesInfo", { notes: ids });
	const out: AnkiExistingNote[] = [];
	for (const info of infos) {
		const nodeId = info?.fields?.NodeId?.value?.trim();
		if (info && nodeId) out.push({ noteId: info.noteId, nodeId });
	}
	return out;
}

async function pushDeck(cfg: ResolvedAnkiSettings, state: AnkiState): Promise<{ added: number; updated: number }> {
	await ensureNoteType(cfg.url);
	await invoke(cfg.url, "createDeck", { deck: cfg.deck });
	const nodes = stores.graphStore.readNodes();
	const plan = planAnkiPush(nodes, await existingNotes(cfg.url), state.pushed);

	let added = 0;
	if (plan.add.length > 0) {
		const ids = await invoke<(number | null)[]>(cfg.url, "addNotes", {
			notes: plan.add.map((a) => ({
				deckName: cfg.deck,
				modelName: ANKI_NOTE_TYPE,
				fields: a.fields,
				tags: ["axiom-learn"],
				options: { allowDuplicate: true },
			})),
		});
		plan.add.forEach((a, i) => {
			if (ids[i] == null) return;
			added++;
			state.pushed[a.nodeId] = fieldsHash(a.fields);
		});
	}
	for (const u of plan.update) {
		await invoke(cfg.url, "updateNoteFields", { note: { id: u.noteId, fields: u.fields } });
		state.pushed[u.nodeId] = fieldsHash(u.fields);
	}
	return { added, updated: plan.update.length };
}

// ─── pull: reviews → review events ───────────────────────────────────────────

interface AnkiCardInfo {
	cardId: number;
	note: number;
	fields: Record<string, { value: string }>;
	interval?: number;
	lapses?: number;
	reps?: number;
	queue?: number;
}

async function pullReviews(url: string, timeoutMs?: number): Promise<NonNullable<AnkiState["pull"]>> {
	const cardIds = await invoke<number[]>(url, "findCards", { query: searchNoteType }, timeoutMs);
	const events: ReviewEvent[] = [];
	const cards: Record<string, AnkiCardStat> = {};
	if (cardIds.length > 0) {
		const infos = await invoke<AnkiCardInfo[]>(url, "cardsInfo", { cards: cardIds }, timeoutMs);
		const revlogs = await invoke<Record<string, AnkiRevlogEntry[]>>(
			url,
			"getReviewsOfCards",
			{ cards: cardIds.map(String) },
			timeoutMs,
		);
		for (const info of infos) {
			const nodeId = info?.fields?.NodeId?.value?.trim();
			if (!nodeId) continue;
			const revlog = revlogs[String(info.cardId)] ?? [];
			events.push(...ankiReviewEvents(nodeId, revlog));
			const stat = ankiCardStat(info, revlog);
			cards[nodeId] = cards[nodeId] ? mergeCardStats(cards[nodeId]!, stat) : stat;
		}
	}
	return { at: Date.now(), events, cards };
}

// ─── public surface ──────────────────────────────────────────────────────────

let running: Promise<AnkiSyncResult> | null = null;

/** Push the graph into the deck, then read the review history back. One
 *  sync at a time: a second caller joins the running one. */
export function syncAnki(): Promise<AnkiSyncResult> {
	running ??= (async () => {
		const cfg = effectiveSettings().anki;
		const state = readState();
		let result: AnkiSyncResult;
		try {
			const { added, updated } = await pushDeck(cfg, state);
			state.pull = await pullReviews(cfg.url);
			result = { at: Date.now(), ok: true, added, updated, cards: Object.keys(state.pull.cards).length, reviews: state.pull.events.length };
		} catch (err) {
			result = { at: Date.now(), ok: false, error: err instanceof Error ? err.message : String(err) };
		}
		state.lastSync = result;
		writeState(state);
		return result;
	})().finally(() => {
		running = null;
	});
	return running;
}

/** Before a new session: refresh the cached review history if Anki is
 *  enabled and open. Never throws and never waits long — a closed Anki
 *  falls back to the last pull. */
export async function refreshAnkiReviews(timeoutMs = 3000): Promise<void> {
	const cfg = effectiveSettings().anki;
	if (!cfg.enabled) return;
	try {
		const pull = await pullReviews(cfg.url, timeoutMs);
		const state = readState();
		state.pull = pull;
		writeState(state);
	} catch {
		// Anki closed or slow: the cached history stands.
	}
}

/** Flashcard reviews from the last pull, for core/review.ts. Empty when
 *  the sync is off, so turning it off removes Anki from the memory model. */
export function cachedAnkiReviewEvents(): ReviewEvent[] {
	if (!effectiveSettings().anki.enabled) return [];
	return readState().pull?.events ?? [];
}

/** Per-node flashcard stats from the last pull (sync on only). */
export function cachedAnkiCardStats(): Record<string, AnkiCardStat> {
	if (!effectiveSettings().anki.enabled) return {};
	return readState().pull?.cards ?? {};
}

export interface AnkiStatus {
	enabled: boolean;
	deck: string;
	url: string;
	/** AnkiConnect answered just now. */
	connected: boolean;
	ankiConnectVersion?: number;
	error?: string;
	lastSync?: AnkiSyncResult;
	lastPullAt?: number;
	cards: number;
}

export async function ankiStatus(): Promise<AnkiStatus> {
	const cfg = effectiveSettings().anki;
	const state = readState();
	const base = {
		enabled: cfg.enabled,
		deck: cfg.deck,
		url: cfg.url,
		...(state.lastSync ? { lastSync: state.lastSync } : {}),
		...(state.pull ? { lastPullAt: state.pull.at } : {}),
		cards: Object.keys(state.pull?.cards ?? {}).length,
	};
	try {
		const version = await invoke<number>(cfg.url, "version", {}, 2000);
		return { ...base, connected: true, ankiConnectVersion: version };
	} catch (err) {
		return { ...base, connected: false, error: err instanceof Error ? err.message : String(err) };
	}
}

// ─── auto-sync after sessions ────────────────────────────────────────────────

/** Quiet period after the last turn / extraction change before pushing:
 *  new graph nodes land a little after a turn, when extraction folds it. */
const AUTO_SYNC_DELAY_MS = 20_000;

interface AnkiAutoGlobal {
	__lhAnkiAutoSync?: boolean;
}

/** Start the background sync once per process (globalThis-guarded, like
 *  the event bus). Does nothing while the sync is off in settings. */
export function ensureAnkiAutoSync(): void {
	const g = globalThis as typeof globalThis & AnkiAutoGlobal;
	if (g.__lhAnkiAutoSync || process.env.NODE_ENV === "test") return;
	g.__lhAnkiAutoSync = true;
	let timer: ReturnType<typeof setTimeout> | undefined;
	subscribe((event) => {
		if (event.type !== "turn-settled" && event.type !== "activity-changed") return;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = undefined;
			if (effectiveSettings().anki.enabled) void syncAnki();
		}, AUTO_SYNC_DELAY_MS);
		timer.unref?.();
	});
}
