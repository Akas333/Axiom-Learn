/**
 * SPACED REVIEW (knowledge decay): how well the learner still remembers
 * each graph node, and when it should come back for practice.
 *
 * The evidence is the practice record itself — every cleanly concluded
 * problem that carries `target` node ids is one review of those nodes.
 * Nothing new is stored: the review state is recomputed from the chat
 * records on every read, so tuning the scheduler never needs a migration.
 *
 * The scheduler is FSRS (the algorithm modern Anki uses), with its
 * published default parameters (FSRS-4.5). Each node carries:
 *   - stability S  — days until recall probability falls to 90%
 *   - difficulty D — 1 (easy) … 10 (hard)
 * and recall probability decays as R(t) = (1 + F·t/S)^-0.5.
 *
 * Browser-safe: pure logic + types, no node imports.
 */

import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";
import { PRACTICE_CONCLUDE_TOOL, problemInputForConclude, type LhMessage } from "./native-messages.ts";

// ─── grades ──────────────────────────────────────────────────────────────────

/** FSRS grades: 1 again (forgot), 2 hard, 3 good, 4 easy. */
export type ReviewGrade = 1 | 2 | 3 | 4;

const HEAVY_HINT_RUNGS = new Set(["R3", "R4", "R5"]);

/**
 * One concluded problem → one grade, or null when the conclusion says
 * nothing about memory. Moved-on is the agent's call, not evidence
 * against the learner, so it is skipped. A dismissal counts as a
 * surrender (the practice doctrine's reading).
 */
export function gradeForConclusion(outcome: unknown, rung: unknown, missClass?: unknown): ReviewGrade | null {
	const grade = baseGrade(outcome, rung);
	// A careless slip is not a memory failure: the right idea came to mind.
	return grade === 1 && missClass === "careless" ? 2 : grade;
}

function baseGrade(outcome: unknown, rung: unknown): ReviewGrade | null {
	switch (outcome) {
		case "solved":
			return rung === null || rung === undefined || rung === "R0" ? 3 : 2;
		case "solvedWithHints":
			// R3+ means the proposition itself had to be named — the
			// retrieval failed even though the problem got finished.
			return typeof rung === "string" && HEAVY_HINT_RUNGS.has(rung) ? 1 : 2;
		case "surrendered":
		case "dismissed":
			return 1;
		default:
			return null;
	}
}

// ─── extracting reviews from a practice record ───────────────────────────────

export interface ReviewEvent {
	nodeId: string;
	/** Epoch ms of the concluding turn. */
	at: number;
	grade: ReviewGrade;
	/** The practice chat the review happened in (when the caller knows it). */
	session?: string;
	/** The problem's demand mode: recall, discrimination, or composition. */
	mode?: string;
	/** The conclude tool call this review came from (practice reviews only):
	 *  the conclude card's anchor, so the graph can link to it. */
	callId?: string;
	/** The conclude outcome as the agent recorded it (practice reviews only). */
	outcome?: string;
}

/**
 * Every review a chat record holds: one per (clean conclude × target).
 *
 * When the conclusion names `missedTargets` (a multi-target problem that
 * broke on some targets only), the grade applies to those targets alone.
 * The other targets were retrieved: they count as a clean success when the
 * problem was finished, and give no evidence when it was given up (the
 * learner may never have reached them).
 */
export function reviewEventsOf(messages: readonly LhMessage[], session?: string): ReviewEvent[] {
	const clean = new Set<string>();
	for (const m of messages) {
		if ((m as { role?: string }).role !== "toolResult") continue;
		const r = m as ToolResultMessage;
		if (!r.isError) clean.add(r.toolCallId);
	}
	const events: ReviewEvent[] = [];
	for (const m of messages) {
		if ((m as { role?: string }).role !== "assistant") continue;
		const assistant = m as AssistantMessage;
		for (const block of assistant.content) {
			if (block.type !== "toolCall" || block.name !== PRACTICE_CONCLUDE_TOOL) continue;
			if (!clean.has(block.id)) continue;
			const args = (block.arguments ?? {}) as {
				outcome?: unknown;
				rung?: unknown;
				missClass?: unknown;
				missedTargets?: unknown;
			};
			const grade = gradeForConclusion(args.outcome, args.rung, args.missClass);
			if (grade === null) continue;
			const pose = problemInputForConclude(messages, block.id);
			const target = pose?.target;
			if (!Array.isArray(target)) continue;
			const ids = [...new Set(target)].filter((id): id is string => typeof id === "string" && id.length > 0);
			const missed = Array.isArray(args.missedTargets)
				? new Set(args.missedTargets.filter((id) => ids.includes(id as string)))
				: new Set<unknown>();
			const finished = args.outcome === "solved" || args.outcome === "solvedWithHints";
			const at = typeof assistant.timestamp === "number" ? assistant.timestamp : 0;
			const mode = typeof pose?.mode === "string" ? pose.mode : undefined;
			for (const id of ids) {
				let g: ReviewGrade | null = grade;
				if (missed.size > 0 && !missed.has(id)) g = finished ? 3 : null;
				if (g === null) continue;
				events.push({
					nodeId: id,
					at,
					grade: g,
					...(session !== undefined ? { session } : {}),
					...(mode !== undefined ? { mode } : {}),
					callId: block.id,
					outcome: String(args.outcome),
				});
			}
		}
	}
	return events;
}

// ─── FSRS ────────────────────────────────────────────────────────────────────

/** FSRS-4.5 default weights. */
const W = [
	0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793,
	0.3246, 1.587, 0.2272, 2.8755,
] as const;
const DECAY = -0.5;
const FACTOR = 19 / 81; // makes R(S) = 0.9
const DAY_MS = 86_400_000;

/** The recall probability the scheduler aims to keep each node above. */
export const TARGET_RETENTION = 0.9;

const clampD = (d: number) => Math.min(10, Math.max(1, d));
const w = (i: number) => W[i]!;

/** Recall probability after `days` elapsed at stability `s`. */
export function retrievability(days: number, s: number): number {
	if (s <= 0) return 0;
	return Math.pow(1 + (FACTOR * Math.max(0, days)) / s, DECAY);
}

/** Days until recall falls to `retention` from a fresh review. */
export function intervalDays(s: number, retention = TARGET_RETENTION): number {
	return (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
}

interface Memory {
	s: number;
	d: number;
}

function initial(grade: ReviewGrade): Memory {
	return { s: w(grade - 1), d: clampD(w(4) - (grade - 3) * w(5)) };
}

function next(mem: Memory, days: number, grade: ReviewGrade): Memory {
	const r = retrievability(days, mem.s);
	const d0Easy = w(4) - (4 - 3) * w(5);
	const d = clampD(w(7) * d0Easy + (1 - w(7)) * (mem.d - w(6) * (grade - 3)));
	if (grade === 1) {
		const s = w(11) * Math.pow(mem.d, -w(12)) * (Math.pow(mem.s + 1, w(13)) - 1) * Math.exp(w(14) * (1 - r));
		return { s: Math.min(s, mem.s), d };
	}
	const hard = grade === 2 ? w(15) : 1;
	const easy = grade === 4 ? w(16) : 1;
	const growth = Math.exp(w(8)) * (11 - mem.d) * Math.pow(mem.s, -w(9)) * (Math.exp(w(10) * (1 - r)) - 1);
	return { s: mem.s * (growth * hard * easy + 1), d };
}

// ─── per-node state ──────────────────────────────────────────────────────────

export interface NodeReviewState {
	nodeId: string;
	reviews: number;
	lastReviewedAt: number;
	lastGrade: ReviewGrade;
	/** Days until recall falls to 90% from the last review. */
	stability: number;
	difficulty: number;
	/** Recall probability right now, 0…1. */
	recall: number;
	/** Epoch ms when recall reaches the target retention. */
	dueAt: number;
	due: boolean;
	/** Distinct practice sessions with a clean success (grade 3+). */
	strongSessions: number;
	/** Distinct demand modes with a clean success (grade 3+). */
	strongModes: number;
	/** The latest review's demand mode ("flashcard" for an Anki review). */
	lastMode?: string;
}

/**
 * Fold review events into one state per node, as of `now`. Several
 * reviews of the same node inside one practice session count as one
 * learning step (FSRS treats same-day repeats as near-zero elapsed time,
 * so a success adds little and a miss still lowers stability).
 */
export function reviewStates(events: readonly ReviewEvent[], now: number): Map<string, NodeReviewState> {
	const byNode = new Map<string, ReviewEvent[]>();
	for (const e of events) {
		const list = byNode.get(e.nodeId);
		if (list) list.push(e);
		else byNode.set(e.nodeId, [e]);
	}
	const out = new Map<string, NodeReviewState>();
	for (const [nodeId, list] of byNode) {
		list.sort((a, b) => a.at - b.at);
		let mem = initial(list[0]!.grade);
		for (let i = 1; i < list.length; i++) {
			const days = (list[i]!.at - list[i - 1]!.at) / DAY_MS;
			mem = next(mem, days, list[i]!.grade);
		}
		const last = list[list.length - 1]!;
		const dueAt = last.at + intervalDays(mem.s) * DAY_MS;
		const strong = list.filter((e) => e.grade >= 3);
		// Events without a session id each count as their own session.
		const sessions = new Set(strong.map((e, i) => e.session ?? `#${i}`));
		const modes = new Set(strong.map((e) => e.mode ?? "recall"));
		out.set(nodeId, {
			nodeId,
			reviews: list.length,
			lastReviewedAt: last.at,
			lastGrade: last.grade,
			stability: mem.s,
			difficulty: mem.d,
			recall: retrievability((now - last.at) / DAY_MS, mem.s),
			dueAt,
			due: now >= dueAt,
			strongSessions: sessions.size,
			strongModes: modes.size,
			...(last.mode !== undefined ? { lastMode: last.mode } : {}),
		});
	}
	return out;
}

/** Due nodes first, weakest recall first — the order a review session uses. */
export function dueOrder(states: Iterable<NodeReviewState>): NodeReviewState[] {
	return [...states].filter((s) => s.due).sort((a, b) => a.recall - b.recall);
}

// ─── named states ────────────────────────────────────────────────────────────

/**
 * How well a claim is held, in five words (the graph's node states):
 *   - untested   — never practiced
 *   - shaky      — the latest attempt was missed or needed heavy hints
 *   - developing — retrieved, but not yet from more than one kind of cue
 *   - solid      — retrieved cleanly in 2+ sessions or 2+ demand modes
 *   - due        — was solid, but recall has faded below the target
 * Solid asks for variety because one session or one problem shape only
 * shows the claim comes to mind in that one context.
 */
export const MASTERY_STATES = ["untested", "shaky", "developing", "solid", "due"] as const;
export type MasteryState = (typeof MASTERY_STATES)[number];

export function masteryStateOf(state: NodeReviewState | undefined): MasteryState {
	if (!state) return "untested";
	if (state.lastGrade === 1) return "shaky";
	if (state.strongSessions >= 2 || state.strongModes >= 2) return state.due ? "due" : "solid";
	return "developing";
}

// ─── what the graph shows per claim ──────────────────────────────────────────

/** One row of a claim's practice history (newest first in ClaimPractice). */
export interface ClaimPracticeEntry {
	at: number;
	grade: ReviewGrade;
	/** The practice chat id, or "anki:<day>" for a flashcard review. */
	session?: string;
	mode?: string;
	/** The conclude call id — the link target inside the session. */
	callId?: string;
	outcome?: string;
}

/** A claim's practice summary, as the graph view receives it. */
export interface ClaimPractice {
	state: MasteryState;
	/** Recall probability right now, 0…1. */
	recall: number;
	dueAt: number;
	reviews: number;
	/** The most recent reviews, newest first (capped at CLAIM_HISTORY_MAX). */
	history: ClaimPracticeEntry[];
}

export const CLAIM_HISTORY_MAX = 8;

/** Every practiced claim's summary, keyed by node id, as of `now`. */
export function claimPracticeOf(events: readonly ReviewEvent[], now: number): Record<string, ClaimPractice> {
	const states = reviewStates(events, now);
	const out: Record<string, ClaimPractice> = {};
	for (const [nodeId, state] of states) {
		const history = events
			.filter((e) => e.nodeId === nodeId)
			.sort((a, b) => b.at - a.at)
			.slice(0, CLAIM_HISTORY_MAX)
			.map(({ nodeId: _n, ...rest }) => rest);
		out[nodeId] = {
			state: masteryStateOf(state),
			recall: state.recall,
			dueAt: state.dueAt,
			reviews: state.reviews,
			history,
		};
	}
	return out;
}

// ─── wording ─────────────────────────────────────────────────────────────────

function agoText(ms: number): string {
	const days = Math.floor(ms / DAY_MS);
	if (days <= 0) return "today";
	if (days === 1) return "yesterday";
	if (days < 30) return `${days} days ago`;
	const months = Math.round(days / 30);
	return months === 1 ? "about a month ago" : `about ${months} months ago`;
}

const GRADE_TEXT: Record<ReviewGrade, string> = {
	1: "missed",
	2: "solved with effort",
	3: "solved",
	4: "solved easily",
};

const ANKI_GRADE_TEXT: Record<ReviewGrade, string> = { 1: "again", 2: "hard", 3: "good", 4: "easy" };

/** The one-line memory note the practice agent reads beside a proposition. */
export function memoryNote(state: NodeReviewState | undefined, now: number): string {
	if (!state) return "memory: never practiced";
	const last =
		state.lastMode === "flashcard"
			? `last reviewed in Anki ${agoText(now - state.lastReviewedAt)} (${ANKI_GRADE_TEXT[state.lastGrade]})`
			: `last practiced ${agoText(now - state.lastReviewedAt)} (${GRADE_TEXT[state.lastGrade]})`;
	const parts = [
		last,
		`${state.reviews} ${state.reviews === 1 ? "review" : "reviews"}`,
		`estimated recall ${Math.round(state.recall * 100)}%`,
		`state ${masteryStateOf(state)}`,
	];
	if (state.due) parts.push("DUE for review");
	return `memory: ${parts.join("; ")}`;
}
