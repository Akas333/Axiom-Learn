/**
 * Courses (2026-10-29): a broad goal becomes a folder — a plan chat with
 * the course's concept map, one chat per concept, a subfolder (with its own
 * plan chat) per composite concept. The pure parts live here: the map's
 * teaching order, the probe's course fields, and each concept chat's
 * status read off its own record. Browser-safe.
 */
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { PlanTree } from "./contracts/plan.ts";
import type { ProbeDoneInput } from "./contracts/probe.ts";
import type { CourseEntry } from "./contracts/chat.ts";
import type { LhMessage } from "./native-messages.ts";

/** The map's nodes in teaching order: prerequisites first (Kahn's sort),
 *  ties kept in the order the plan listed them. */
export function courseOrder(tree: PlanTree): string[] {
	const ids = tree.nodes.map((n) => n.id);
	const indegree = new Map(ids.map((id) => [id, 0]));
	for (const e of tree.edges) if (indegree.has(e.to) && indegree.has(e.from)) indegree.set(e.to, indegree.get(e.to)! + 1);
	const order: string[] = [];
	const ready = ids.filter((id) => indegree.get(id) === 0);
	while (ready.length > 0) {
		const id = ready.shift()!;
		order.push(id);
		for (const e of tree.edges) {
			if (e.from !== id || !indegree.has(e.to)) continue;
			const left = indegree.get(e.to)! - 1;
			indegree.set(e.to, left);
			if (left === 0) {
				// Keep plan order among newly ready nodes.
				const at = ready.findIndex((r) => ids.indexOf(r) > ids.indexOf(e.to));
				if (at === -1) ready.push(e.to);
				else ready.splice(at, 0, e.to);
			}
		}
	}
	// A cycle (plan_init refuses them) would strand nodes — append them.
	for (const id of ids) if (!order.includes(id)) order.push(id);
	return order;
}

/** The newest probe_done call's input in a transcript (any state). */
export function probeDoneInputOf(messages: readonly LhMessage[]): ProbeDoneInput | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if ((m as { role?: string }).role !== "assistant") continue;
		for (const block of (m as AssistantMessage).content) {
			if (block.type === "toolCall" && block.name === "probe_done") return (block.arguments ?? null) as unknown as ProbeDoneInput | null;
		}
	}
	return null;
}

/** A concept chat's status from its own record: done once a clean
 *  concept_done closes it with nothing next; in progress once the teacher
 *  (or practitioner) has said anything; otherwise not started. */
export function conceptChatStatus(messages: readonly LhMessage[]): CourseEntry["status"] {
	const clean = new Set<string>();
	for (const m of messages) {
		const r = m as { role?: string; toolCallId?: string; isError?: boolean };
		if (r.role === "toolResult" && !r.isError && r.toolCallId) clean.add(r.toolCallId);
	}
	let started = false;
	for (const m of messages) {
		if ((m as { role?: string }).role !== "assistant") continue;
		started = true;
		for (const block of (m as AssistantMessage).content) {
			if (block.type !== "toolCall" || block.name !== "concept_done" || !clean.has(block.id)) continue;
			if (typeof (block.arguments as { nextNodeId?: unknown } | undefined)?.nextNodeId !== "string") return "done";
		}
	}
	return started ? "in-progress" : "not-started";
}
