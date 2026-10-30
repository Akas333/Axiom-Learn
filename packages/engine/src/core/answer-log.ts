/**
 * The graded-answer log + the per-node ability fold (2026-10-30, the IRT
 * groundwork — arXiv 2510.00844 read with the learner as the respondent
 * and every question as an item).
 *
 * DERIVED, never stored: every graded answer already lives in the chat
 * record (a quiz's verdict rides its toolResult `details`, a practice
 * problem's on its conclude call), so the log is a read-time fold over the
 * records — the whole history counts, and nothing can drift from the
 * transcript. Pure: no stores, no clock.
 *
 * Explain/recall answers are NOT logged: the model grades them in prose,
 * so there is no structured verdict to read yet.
 */

import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";
import type { ChatRecord } from "./contracts/chat.ts";
import type { QuestionAnswerData } from "./question-core.ts";
import { PRACTICE_CONCLUDE_TOOL, PRACTICE_PROBLEM_TOOL, type LhMessage } from "./native-messages.ts";
import { toolQuestionKind } from "./pending.ts";

/** Where an event's node ids live: `plan` = this chat's plan-tree slugs
 *  (teach quizzes), `graph` = knowledge-graph proposition ids (practice
 *  targets). Plan slugs are only unique within their chat. */
export type NodeSpace = "plan" | "graph";

export interface AnswerEvent {
	chatId: string;
	/** The question call's id — the event's identity within its chat. */
	toolCallId: string;
	/** probe | quiz (multiple choice) or problem (practice). */
	tool: string;
	phase: "probe" | "teach" | "practice";
	nodeSpace: NodeSpace;
	/** The nodes the item tests — empty for untagged items (probe quizzes,
	 *  untagged practice). */
	nodeIds: string[];
	questionText: string;
	/** The author's difficulty estimate, 1 (routine) – 5 (hardest) at the
	 *  learner's target level; absent on items posed without one. */
	difficulty?: number;
	/** 0–1: quiz = 1 right / 0 wrong; practice = solved 1, with hints 0.5,
	 *  moved on or surrendered 0. */
	score: number;
	dontKnow?: boolean;
	/** The learner's stated probability (0–100) that the answer is right. */
	confidence?: number;
	/** teach quizzes: predict | check. */
	questionType?: string;
	/** practice only: the raw conclude grading. */
	outcome?: string;
	rung?: string | null;
	missClass?: string | null;
	answeredAt: string;
}

const OUTCOME_SCORES: Record<string, number> = {
	solved: 1,
	solvedWithHints: 0.5,
	movedOn: 0,
	surrendered: 0,
};

function validDifficulty(raw: unknown): number | undefined {
	const n = typeof raw === "string" ? Number(raw) : raw;
	return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
}

function stringList(raw: unknown): string[] {
	if (typeof raw === "string") return raw.trim() ? [raw.trim()] : [];
	return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];
}

/** Every graded answer in one chat record, in transcript order. */
export function answerEventsOf(record: Pick<ChatRecord, "id" | "messages" | "kind">): AnswerEvent[] {
	const calls = new Map<string, { name: string; args: Record<string, unknown> }>();
	const events: AnswerEvent[] = [];
	// The newest cleanly-acked pose — a conclude grades the problem before it.
	let lastPose: Record<string, unknown> | undefined;

	for (const m of record.messages as LhMessage[]) {
		const role = (m as { role?: string }).role;
		if (role === "assistant") {
			for (const block of (m as AssistantMessage).content) {
				if (block.type !== "toolCall") continue;
				calls.set(block.id, { name: block.name, args: (block.arguments ?? {}) as Record<string, unknown> });
			}
			continue;
		}
		if (role !== "toolResult") continue;
		const result = m as ToolResultMessage;
		if (result.isError) continue;
		const call = calls.get(result.toolCallId);
		if (!call) continue;

		if (call.name === PRACTICE_PROBLEM_TOOL) {
			lastPose = call.args;
			continue;
		}

		if (call.name === PRACTICE_CONCLUDE_TOOL) {
			const outcome = typeof call.args.outcome === "string" ? call.args.outcome : undefined;
			const score = outcome !== undefined ? OUTCOME_SCORES[outcome] : undefined;
			const pose = lastPose;
			lastPose = undefined;
			if (score === undefined || !pose) continue; // dismissed / unknown outcome: no verdict
			const poseDifficulty = validDifficulty(pose.difficulty);
			events.push({
				chatId: record.id,
				toolCallId: result.toolCallId,
				tool: PRACTICE_PROBLEM_TOOL,
				phase: "practice",
				nodeSpace: "graph",
				nodeIds: stringList(pose.target),
				questionText: typeof pose.statement === "string" ? pose.statement : "",
				...(poseDifficulty !== undefined ? { difficulty: poseDifficulty } : {}),
				score,
				outcome,
				rung: typeof call.args.rung === "string" ? call.args.rung : null,
				missClass: typeof call.args.missClass === "string" ? call.args.missClass : null,
				answeredAt: new Date(result.timestamp).toISOString(),
			});
			continue;
		}

		if (toolQuestionKind(call.name) !== "quiz") continue;
		const answer = result.details as Partial<QuestionAnswerData> | undefined;
		if (!answer || answer.kind !== "quiz" || answer.dismissed || typeof answer.correct !== "boolean") continue;
		const difficulty = validDifficulty(call.args.difficulty);
		events.push({
			chatId: record.id,
			toolCallId: result.toolCallId,
			tool: call.name,
			phase: call.name === "probe" || call.args.nodeId === undefined ? "probe" : "teach",
			nodeSpace: "plan",
			nodeIds: stringList(call.args.nodeId),
			questionText: answer.questionText ?? "",
			...(difficulty !== undefined ? { difficulty } : {}),
			score: answer.correct && !answer.dontKnow ? 1 : 0,
			...(answer.dontKnow ? { dontKnow: true } : {}),
			...(answer.confidence !== undefined ? { confidence: answer.confidence } : {}),
			...(answer.questionType ? { questionType: answer.questionType } : {}),
			answeredAt: answer.answeredAt ?? new Date(result.timestamp).toISOString(),
		});
	}
	return events;
}

// ─── the ability fold ───────────────────────────────────────────────────────

/** One node's running ability estimate (logit scale, 0 = a fifty-fifty
 *  shot at a difficulty-3 item). */
export interface NodeAbility {
	nodeSpace: NodeSpace;
	nodeId: string;
	/** Plan nodes only: the chat whose plan the slug belongs to. */
	chatId?: string;
	theta: number;
	/** Graded answers folded in. */
	n: number;
	/** P(correct) on a difficulty-3 item at the current theta. */
	pMid: number;
	lastAnsweredAt: string;
}

/** The item's difficulty on the logit scale: 3 ↦ 0, each step ±0.8; an
 *  unrated item counts as average. */
export function itemDifficulty(difficulty: number | undefined): number {
	return difficulty === undefined ? 0 : (difficulty - 3) * 0.8;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Online Rasch update (the 1-D special case of σ(αᵀθ − β), α = 1 on the
 *  item's tagged nodes): θ += K · (score − P), with K shrinking as the node
 *  collects answers so early answers move it most. An item tagged with
 *  several nodes updates each. Events fold in answeredAt order. */
export function abilityOf(events: readonly AnswerEvent[]): NodeAbility[] {
	const byKey = new Map<string, NodeAbility>();
	const ordered = [...events].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
	for (const e of ordered) {
		const beta = itemDifficulty(e.difficulty);
		for (const nodeId of e.nodeIds) {
			const key = e.nodeSpace === "plan" ? `plan:${e.chatId}:${nodeId}` : `graph:${nodeId}`;
			const cur = byKey.get(key) ?? {
				nodeSpace: e.nodeSpace,
				nodeId,
				...(e.nodeSpace === "plan" ? { chatId: e.chatId } : {}),
				theta: 0,
				n: 0,
				pMid: 0.5,
				lastAnsweredAt: e.answeredAt,
			};
			const k = 1.2 / (1 + 0.3 * cur.n);
			cur.theta += k * (e.score - sigmoid(cur.theta - beta));
			cur.n += 1;
			cur.pMid = sigmoid(cur.theta);
			cur.lastAnsweredAt = e.answeredAt;
			byKey.set(key, cur);
		}
	}
	return [...byKey.values()];
}
