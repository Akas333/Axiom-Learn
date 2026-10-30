/**
 * The textbook style's transcript folds (2026-10-29). A textbook chat
 * teaches ONE concept in four stages — intuition (predict questions after
 * the plain-language idea), the textbook section, worked illustrations,
 * exercises — and its plan map's nodes are the concept's nuances, which
 * the exercises must cover. Nothing here is stored: like the plan's
 * position (contracts/plan.ts), stage and coverage derive from the
 * record's tool calls every time. Pure, browser-safe.
 */
import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";
import { nativeInputCause, type LhMessage } from "./native-messages.ts";
import type { PlanTree } from "./contracts/plan.ts";

export const TEXTBOOK_SECTION_TOOL = "section";
export const TEXTBOOK_ILLUSTRATION_TOOL = "illustration";

/** Where a textbook chat stands. null = before the first stage (probing
 *  or planning). */
export type TextbookStage = "intuition" | "section" | "illustrations" | "exercises" | "done";

/** Rungs that still count as solving it yourself (practice doctrine §VI:
 *  R0–R1 means the problem was about right). */
const UNAIDED_RUNGS = new Set<unknown>([null, undefined, "R0", "R1"]);

interface CallBlock {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

/** Every tool call in record order, with whether its result came back clean. */
function callsInOrder(messages: readonly LhMessage[]): Array<CallBlock & { clean: boolean }> {
	const clean = new Set<string>();
	for (const m of messages) {
		if ((m as { role?: string }).role !== "toolResult") continue;
		const result = m as ToolResultMessage;
		if (!result.isError) clean.add(result.toolCallId);
	}
	const calls: Array<CallBlock & { clean: boolean }> = [];
	for (const m of messages) {
		if ((m as { role?: string }).role !== "assistant") continue;
		for (const block of (m as AssistantMessage).content) {
			if (block.type !== "toolCall") continue;
			calls.push({
				id: block.id,
				name: block.name,
				arguments: (block.arguments ?? {}) as Record<string, unknown>,
				clean: clean.has(block.id),
			});
		}
	}
	return calls;
}

function stringList(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** The latest stage the teacher has entered. A prediction question is the
 *  intuition stage; a section, an illustration, a problem each open their
 *  own; a clean concept_done with nothing next closes the concept.
 *  Stages only move forward in practice, but the fold simply reports the
 *  latest — a re-explanation after exercises reads honestly. */
export function textbookStage(messages: readonly LhMessage[]): TextbookStage | null {
	let stage: TextbookStage | null = null;
	for (const call of callsInOrder(messages)) {
		if ((call.name === "quiz" || call.name === "explain") && call.arguments.type === "predict") {
			if (stage === null) stage = "intuition";
		} else if (call.name === TEXTBOOK_SECTION_TOOL && call.clean) stage = "section";
		else if (call.name === TEXTBOOK_ILLUSTRATION_TOOL && call.clean) stage = "illustrations";
		else if (call.name === "problem" && call.clean) stage = "exercises";
		else if (call.name === "concept_done" && call.clean && typeof call.arguments.nextNodeId !== "string") stage = "done";
	}
	return stage;
}

/** One nuance's state: covered once an exercise tagged with it was solved
 *  unaided (rung ≤ R1, not among missedTargets); seen once an
 *  illustration worked it. */
export type NuanceState = "covered" | "seen" | "pending";

export interface TextbookCoverage {
	/** Per plan node. */
	states: Map<string, NuanceState>;
	/** Nodes not yet covered, in plan order. */
	uncovered: string[];
	/** Illustrations shown so far (numbering for the next one). */
	illustrationCount: number;
}

export function deriveCoverage(tree: PlanTree | undefined, messages: readonly LhMessage[]): TextbookCoverage {
	const ids = new Set((tree?.nodes ?? []).map((n) => n.id));
	const covered = new Set<string>();
	const seen = new Set<string>();
	let illustrationCount = 0;
	let active: string[] | null = null;
	for (const call of callsInOrder(messages)) {
		if (!call.clean) continue;
		if (call.name === TEXTBOOK_ILLUSTRATION_TOOL) {
			illustrationCount++;
			const nodeId = call.arguments.nodeId;
			if (typeof nodeId === "string" && ids.has(nodeId)) seen.add(nodeId);
		} else if (call.name === "problem") {
			active = stringList(call.arguments.nodeIds).filter((id) => ids.has(id));
		} else if (call.name === "conclude" && active) {
			const { outcome, rung } = call.arguments;
			if ((outcome === "solved" || outcome === "solvedWithHints") && UNAIDED_RUNGS.has(rung)) {
				const missed = new Set(stringList(call.arguments.missedTargets));
				for (const id of active) if (!missed.has(id)) covered.add(id);
			}
			active = null;
		}
	}
	const states = new Map<string, NuanceState>();
	const uncovered: string[] = [];
	for (const node of tree?.nodes ?? []) {
		const state: NuanceState = covered.has(node.id) ? "covered" : seen.has(node.id) ? "seen" : "pending";
		states.set(node.id, state);
		if (state !== "covered") uncovered.push(node.id);
	}
	return { states, uncovered, illustrationCount };
}

/** A textbook pose still waiting on the learner: its call, which card it
 *  is, and whether a background delivery (a figure, a demo) has landed
 *  below it since — the card's own Continue is then out of view. */
export interface TextbookPose {
	callId: string;
	tool: typeof TEXTBOOK_SECTION_TOOL | typeof TEXTBOOK_ILLUSTRATION_TOOL;
	buried: boolean;
}

/** The textbook pose the session is waiting on (its Continue is live): the
 *  newest assistant tool call is a clean section or illustration and the
 *  learner has said nothing since. Prose-only replies after it (a closing
 *  line, the turn a delivered figure woke) and the deliveries themselves
 *  don't end the wait. Null otherwise. */
export function textbookPose(messages: readonly LhMessage[]): TextbookPose | null {
	const clean = new Set<string>();
	for (const m of messages) {
		const r = m as { role?: string; toolCallId?: string; isError?: boolean };
		if (r.role === "toolResult" && !r.isError && r.toolCallId) clean.add(r.toolCallId);
	}
	let buried = false;
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		const role = (m as { role?: string }).role;
		if (role === "toolResult") continue;
		if (role === "assistant") {
			const last = (m as AssistantMessage).content.filter((b) => b.type === "toolCall").at(-1);
			if (!last || last.type !== "toolCall") continue;
			if (last.name !== TEXTBOOK_SECTION_TOOL && last.name !== TEXTBOOK_ILLUSTRATION_TOOL) return null;
			return clean.has(last.id) ? { callId: last.id, tool: last.name, buried } : null;
		}
		const cause = nativeInputCause(m, messages);
		if (cause === "automatic") buried = true;
		else if (cause !== "neutral") return null;
	}
	return null;
}

/** The waiting pose's call id (the card whose Continue is live), or null. */
export function textbookWaitingOn(messages: readonly LhMessage[]): string | null {
	return textbookPose(messages)?.callId ?? null;
}
