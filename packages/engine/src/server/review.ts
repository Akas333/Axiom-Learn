import { dueOrder, reviewEventsOf, reviewStates, type NodeReviewState, type ReviewEvent } from "../core/review.ts";
import { stores } from "./stores.ts";

/**
 * The spaced-review read (GET /api/review, and the practice session
 * context): every practice record's concluded problems folded into one
 * memory state per graph node. A pure read — recomputed each call, so
 * nothing new is stored and deleted sessions or nodes drop out by
 * themselves.
 */

export interface ReviewNode extends NodeReviewState {
	name: string;
	statement: string;
}

export interface ReviewView {
	now: number;
	/** Every practiced node that still exists in the graph. */
	nodes: ReviewNode[];
	/** The due subset, weakest recall first. */
	due: ReviewNode[];
}

export function allReviewEvents(): ReviewEvent[] {
	const events: ReviewEvent[] = [];
	for (const summary of stores.chatStore.listChats()) {
		const record = stores.chatStore.getChat(summary.id);
		if (!record || record.kind !== "practice") continue;
		events.push(...reviewEventsOf(record.messages));
	}
	return events;
}

/** Current memory state per node id (only practiced nodes appear). */
export function reviewStateMap(now = Date.now()): Map<string, NodeReviewState> {
	return reviewStates(allReviewEvents(), now);
}

export function reviewView(now = Date.now()): ReviewView {
	const byId = new Map(stores.graphStore.readNodes().map((n) => [n.id, n]));
	const nodes: ReviewNode[] = [];
	for (const state of reviewStateMap(now).values()) {
		const node = byId.get(state.nodeId);
		if (node) nodes.push({ ...state, name: node.name, statement: node.statement });
	}
	const due = dueOrder(nodes) as ReviewNode[];
	return { now, nodes, due };
}
