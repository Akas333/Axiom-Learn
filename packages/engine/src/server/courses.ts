import type { ChatSummary, CourseEntry, PlanTree } from "../core/contracts.ts";
import { conceptChatStatus, courseOrder } from "../core/course.ts";
import { stores } from "./stores.ts";

/** A course folder's map, in teaching order, each node with the chat that
 *  teaches it and that chat's status (2026-10-29). A composite node's
 *  status rolls up its subfolder's. Null when the folder is not a course. */
export function courseEntries(folderId: string, depth = 0): { planChatId: string; tree: PlanTree | null; entries: CourseEntry[] } | null {
	const folder = stores.chatStore.listFolders().find((f) => f.id === folderId);
	if (!folder?.planChatId) return null;
	const plan = stores.chatStore.getChat(folder.planChatId);
	if (!plan) return null;
	const chats = stores.chatStore.listChats();
	const byNode = new Map<string, ChatSummary>();
	for (const c of chats) {
		const link = c.course;
		if (!link?.conceptId) continue;
		const mine = link.role === "concept" ? link.planChatId === plan.id : link.parentPlanChatId === plan.id;
		if (mine) byNode.set(link.conceptId, c);
	}
	const tree = plan.tree;
	if (!tree) return { planChatId: plan.id, tree: null, entries: [] };
	const titles = new Map(tree.nodes.map((n) => [n.id, n.title]));
	const entries: CourseEntry[] = courseOrder(tree).map((nodeId) => {
		const chat = byNode.get(nodeId);
		if (!chat) return { nodeId, title: titles.get(nodeId) ?? nodeId, chatId: null, kind: "teach", status: "not-started" };
		const sub = chat.course?.role === "plan" ? chat.course.folderId : undefined;
		const record = stores.chatStore.getChat(chat.id);
		let status = record ? conceptChatStatus(record.messages) : "not-started";
		if (sub && depth < 8) {
			// A composite concept is done when its own course is.
			const inner = courseEntries(sub, depth + 1);
			if (inner && inner.entries.length > 0) {
				status = inner.entries.every((e) => e.status === "done")
					? "done"
					: inner.entries.some((e) => e.status !== "not-started") || status !== "not-started"
						? "in-progress"
						: "not-started";
			}
		}
		return { nodeId, title: titles.get(nodeId) ?? nodeId, chatId: chat.id, kind: chat.kind, ...(sub ? { folderId: sub } : {}), status };
	});
	return { planChatId: plan.id, tree, entries };
}
