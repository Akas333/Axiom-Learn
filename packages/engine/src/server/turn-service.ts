/**
 * The chat-turn services — one named seam per turn
 * responsibility, extracted from the chat-handler so it composes instead of
 * implementing. Each takes its dependencies explicitly (storage ports, the
 * job runner) — no module here imports an adapter.
 *
 *   persistTurn        — the canonical state write (Wave B: native history;
 *                        id stamping, placeholder filtering, plan-block
 *                        emission, abort-partial persistence)
 *   triggerExtraction  — the graph write channel: fires the extraction
 *                        pipeline (the sole graph writer) once a chat
 *                        crosses the token-budget threshold.
 *
 * Logs are the minimal-observability baseline: one line per failure, tagged
 * [chat <id>] — structured logging lands behind these seams later.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import type { LhMessage } from "../core/native-messages.ts";
import { newMessageId } from "../core/native-messages.ts";
import { QUESTION_TOOLS } from "../core/pending.ts";
import { planBlocksFor } from "../core/plan-blocks.ts";
import { coverageOf } from "../core/coverage.ts";
import type { ChatStore, GraphStore } from "../core/ports.ts";
import type { ExtractionPipeline } from "../agent/subagents/extraction.ts";
import { ModelsNotConfiguredError, ProviderKeyMissingError } from "../core/settings.ts";
import { isTurnRunning } from "./turn-liveness.ts";

/** Distinguish a failed canonical save from later bookkeeping failures. */
export class TurnPersistenceError extends Error {
	constructor(cause: unknown) {
		super("The reply could not be saved.", { cause });
		this.name = "TurnPersistenceError";
	}
}

/**
 * The canonical state write (Wave B, owner-approved 2026-09-26): append the
 * turn's own messages — the agent loop's native history, provider/model/
 * usage/thinkingSignature stamped by pi itself. Persists even when aborted
 * — the partial transcript (including a pending question's unanswered
 * call) is what makes resume work.
 *
 * - Id stamping: pi messages carry no id; the record's identity needs one
 *   per message (client keys, append-only adoption, the continuation
 *   seam). Minted here, at the single canonical write.
 * - Placeholder filtering: a cleanly-posed question's synthetic
 *   "question posed" result is an in-memory loop device (Wave A's
 *   terminate) — NEVER persisted (fork 1: the record ends at the
 *   unanswered call; the learner's answer arrives as the real tool
 *   result). Errored question calls DO persist — the model's retry
 *   context.
 * - Plan blocks: one frozen snapshot per successful plan_init call,
 *   idempotent (persist replays are safe).
 *
 * Returns the stamped new messages (usage provenance reads them). Throws
 * TurnPersistenceError on failure so the runner can report it before DONE.
 */
export function persistTurn(
	chatStore: ChatStore,
	chatId: string,
	baseCount: number,
	turnMessages: readonly AgentMessage[],
	isAborted: boolean,
): LhMessage[] {
	try {
		const record = chatStore.getChat(chatId);
		if (!record) throw new Error(`Chat not found: ${chatId}`);
		const stamped: LhMessage[] = [];
		for (const m of turnMessages.slice(baseCount)) {
			const message = m as LhMessage;
			// The placeholder question result: loop device, never a record fact.
			if (
				(message as { role?: string }).role === "toolResult" &&
				(QUESTION_TOOLS as readonly string[]).includes((message as ToolResultMessage).toolName) &&
				!(message as ToolResultMessage).isError
			) {
				continue;
			}
			stamped.push(message.id ? message : ({ ...message, id: newMessageId() } as LhMessage));
		}
		const tree = record.tree;
		const blocks = planBlocksFor(record.messages, stamped, tree, [
			...record.messages,
			...stamped,
		]);
		chatStore.saveMessages(chatId, [...record.messages, ...stamped, ...blocks]);
		return stamped;
	} catch (err) {
		console.error(`[chat ${chatId}] persist failed:`, err, { isAborted });
		throw new TurnPersistenceError(err);
	}
}

/**
 * The graph write channel (vision §1 construction): the extraction pipeline
 * (extractor → auditor → merger — the sole graph writer) runs ASYNC once a
 * chat's UNCOVERED transcript tokens reach the chunk budget
 * (vision-extraction-coverage.md, 2026-09-15). Coverage reads through the
 * projection (the record is native history; the extraction view stays
 * client-shaped until Wave D). Fire-and-forget — never blocks the turn;
 * failures are logged by the pipeline and leave coverage untouched, so the
 * next trigger (or the manual extract button) re-runs what's left.
 *
 * Deliberately isolated in this one seam — the pipeline is
 * trigger-agnostic. Skipped under tests: scripted chats are fixtures, not
 * knowledge (the pipeline itself is tested directly with mock models).
 */
export function triggerExtraction(
	deps: { chatStore: ChatStore; graphStore: GraphStore },
	extraction: ExtractionPipeline,
	chatId: string,
	chunkTokens: number,
): void {
	if (process.env.NODE_ENV === "test") return;
	try {
		const record = deps.chatStore.getChat(chatId);
		if (!record) return;
		const covered = coverageOf(record.messages, deps.graphStore.readCoverage(), chatId);
		if (covered.uncoveredTokens < chunkTokens) {
			// Below the chunk budget: flush once the session goes quiet, so short
			// sessions still reach the graph (a lesson rarely piles up a full
			// chunk of teacher prose before the learner pauses).
			if (covered.uncoveredTokens > 0) scheduleIdleExtraction(deps, extraction, chatId);
			return;
		}
		cancelIdleExtraction(chatId);
		runAndLog(extraction, chatId);
	} catch (err) {
		console.error(`[chat ${chatId}] extraction trigger failed:`, err);
	}
}

/** How long a session must stay quiet before its leftover prose is extracted. */
export const IDLE_EXTRACTION_MS = 90_000;
/** Below this much new teacher prose, an idle flush isn't worth a model call. */
export const IDLE_EXTRACTION_MIN_TOKENS = 150;

const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** (Re)start the chat's quiet timer: every finished turn pushes it back. */
export function scheduleIdleExtraction(
	deps: { chatStore: ChatStore; graphStore: GraphStore },
	extraction: ExtractionPipeline,
	chatId: string,
	delayMs: number = IDLE_EXTRACTION_MS,
): void {
	cancelIdleExtraction(chatId);
	const timer = setTimeout(() => {
		idleTimers.delete(chatId);
		try {
			// A turn started meanwhile: its own end re-arms the timer.
			if (isTurnRunning(chatId)) return;
			const record = deps.chatStore.getChat(chatId);
			if (!record) return;
			const covered = coverageOf(record.messages, deps.graphStore.readCoverage(), chatId);
			if (covered.uncoveredTokens < IDLE_EXTRACTION_MIN_TOKENS) return;
			runAndLog(extraction, chatId);
		} catch (err) {
			console.error(`[chat ${chatId}] idle extraction failed:`, err);
		}
	}, delayMs);
	timer.unref?.();
	idleTimers.set(chatId, timer);
}

export function cancelIdleExtraction(chatId: string): void {
	const timer = idleTimers.get(chatId);
	if (timer) clearTimeout(timer);
	idleTimers.delete(chatId);
}

function runAndLog(extraction: ExtractionPipeline, chatId: string): void {
	void extraction.runExtraction(chatId).catch((err) => {
		// BYOK (owner, 2026-09-22) + key presence (provider-key interlude,
		// 2026-09-25): an unconfigured OR keyless write channel SKIPS (the
		// coverage ledger keeps the messages uncovered — the next trigger
		// retries once slots/keys are set); only real failures log.
		if (err instanceof ModelsNotConfiguredError) {
			console.info(`[chat ${chatId}] extraction skipped — ${err.envelope.error} (missing: ${err.envelope.missing.join(", ")})`);
			return;
		}
		if (err instanceof ProviderKeyMissingError) {
			console.info(`[chat ${chatId}] extraction skipped — ${err.envelope.error} (provider: ${err.envelope.provider})`);
			return;
		}
		console.error(`[chat ${chatId}] extraction pipeline failed:`, err);
	});
}
