/**
 * course_open (2026-10-29): turns a confirmed COURSE plan into the course
 * folder. A chat teaches exactly one concept, so when the probe found the
 * goal spans several (probe_done scope "course"), this chat's plan map is
 * the course's concept map, and course_open builds:
 *
 *   - the course folder (named after this chat; nested when this chat is
 *     itself a subfolder's plan chat or was started inside a folder), with
 *     this chat moved in as its plan chat;
 *   - one chat per map node, in teaching order, same teaching style —
 *     practice for the concepts the probe found he already holds;
 *   - a subfolder per composite node, holding a new plan chat for it: the
 *     same structure one level down, planned when he opens it.
 *
 * Every new chat opens with a course-context marker: the course, his
 * objective and level, where the concept sits, and the course probe's read
 * of him. Re-calling it syncs — chats exist for new nodes afterwards,
 * started ones are never touched. Registered only in a course-scope chat.
 */
import { Type } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { invalidInputResult } from "../tool-execute.ts";
import type { ChatStore } from "../../core/ports.ts";
import type { ChatKind, CourseLink } from "../../core/contracts/chat.ts";
import { courseOrder, probeDoneInputOf } from "../../core/course.ts";
import { newCourseContextMessage } from "../../core/native-messages.ts";

export interface CourseToolContext {
	chatId: string;
	chatStore: ChatStore;
	/** Material ids attached to a folder (materials, 2026-10-29). Absent
	 *  (tests) = none. */
	materialIdsFor?: (folderId: string) => string[];
}

export const courseOpenInput = Type.Object({
	practiceNodeIds: Type.Optional(
		Type.Array(Type.String(), {
			minItems: 1,
			description: "Concepts the probe showed he already holds at his target level — their chats open as practice. Exact plan_init slugs.",
		}),
	),
	compositeNodeIds: Type.Optional(
		Type.Array(Type.String(), {
			minItems: 1,
			description: "Concepts too big for one chat — each becomes a subfolder with its own plan chat. Exact plan_init slugs.",
		}),
	),
});

/** One concept's chat as the result reports it (the UI's course card). */
export interface CourseOpenEntry {
	nodeId: string;
	title: string;
	chatId: string;
	kind: ChatKind;
	/** A composite concept: its subfolder (the chat is its plan chat). */
	folderId?: string;
	/** False when the chat already existed (a re-sync). */
	created: boolean;
}

export interface CourseOpenDetails {
	folderId: string;
	entries: CourseOpenEntry[];
	/** The chat the learner continues in: the first not-yet-started concept. */
	firstChatId: string | null;
}

export function courseTools(ctx: CourseToolContext): Record<string, AgentTool<any>> {
	const record = ctx.chatStore.getChat(ctx.chatId);
	if (!record || probeDoneInputOf(record.messages)?.scope !== "course") return {};
	return { course_open: courseOpenTool(ctx) };
}

export function courseOpenTool(ctx: CourseToolContext): AgentTool<typeof courseOpenInput> {
	return {
		name: "course_open",
		label: "course_open",
		description:
			"Open the confirmed course: creates the course folder (this chat becomes its plan chat) and one chat per node of your " +
			"plan map — practice chats for practiceNodeIds, a subfolder with its own plan chat for each compositeNodeId. Call it once " +
			"the learner has confirmed the course plan. Ends the turn; the app takes him to the first concept's chat.",
		parameters: courseOpenInput,
		executionMode: "sequential",
		execute: async (_toolCallId, input): Promise<AgentToolResult<CourseOpenDetails | { tool: string; problems: string[] }>> => {
			const store = ctx.chatStore;
			const record = store.getChat(ctx.chatId);
			const tree = record?.tree;
			if (!record || !tree || tree.nodes.length === 0) {
				return invalidInputResult("course_open", ["No course map exists yet — call plan_init, present it, and wait for his confirmation."]);
			}
			const nodes = new Map(tree.nodes.map((n) => [n.id, n]));
			const practice = new Set(input.practiceNodeIds ?? []);
			const composite = new Set(input.compositeNodeIds ?? []);
			const unknown = [...practice, ...composite].filter((id) => !nodes.has(id));
			if (unknown.length > 0) {
				return invalidInputResult("course_open", [`${JSON.stringify(unknown)} match no node in this chat's plan map`]);
			}
			const probe = probeDoneInputOf(record.messages);

			// The course folder: reuse this chat's own (a subfolder's plan
			// chat, or a re-sync); otherwise create it beside where the chat is.
			let folderId: string;
			if (record.course?.role === "plan") {
				folderId = record.course.folderId;
			} else {
				const folder = store.createFolder(record.title, { parentId: record.folderId, planChatId: record.id });
				folderId = folder.id;
				store.setChatFolder(record.id, folderId);
				store.setChatCourse(record.id, { role: "plan", folderId, planChatId: record.id, order: -1 });
			}
			const materialIds = ctx.materialIdsFor?.(folderId) ?? [];

			// Chats this map already opened (re-sync): keyed by node.
			const existing = new Map<string, { id: string; kind: ChatKind; folderId?: string }>();
			for (const c of store.listChats()) {
				const link = c.course;
				if (!link?.conceptId) continue;
				const mine = link.role === "concept" ? link.planChatId === record.id : link.parentPlanChatId === record.id;
				if (mine) existing.set(link.conceptId, { id: c.id, kind: c.kind, ...(link.role === "plan" ? { folderId: link.folderId } : {}) });
			}

			const order = courseOrder(tree);
			const titleOf = (id: string) => nodes.get(id)?.title ?? id;
			const entries: CourseOpenEntry[] = [];
			order.forEach((nodeId, index) => {
				const node = nodes.get(nodeId)!;
				const found = existing.get(nodeId);
				if (found) {
					entries.push({ nodeId, title: node.title, chatId: found.id, kind: found.kind, ...(found.folderId ? { folderId: found.folderId } : {}), created: false });
					return;
				}
				const isComposite = composite.has(nodeId);
				const kind: ChatKind = !isComposite && practice.has(nodeId) ? "practice" : "teach";
				const chat = store.createChat(node.title, kind === "practice" ? "practice" : undefined, record.style === "textbook" ? "textbook" : undefined);
				let link: CourseLink;
				let subfolderId: string | undefined;
				if (isComposite) {
					subfolderId = store.createFolder(node.title, { parentId: folderId, planChatId: chat.id }).id;
					link = { role: "plan", folderId: subfolderId, planChatId: chat.id, conceptId: nodeId, parentPlanChatId: record.id, order: index };
				} else {
					link = { role: "concept", folderId, planChatId: record.id, conceptId: nodeId, order: index };
				}
				store.setChatFolder(chat.id, subfolderId ?? folderId);
				store.setChatCourse(chat.id, link);
				if (record.settings) store.saveSettings(chat.id, record.settings);
				store.saveMessages(chat.id, [
					newCourseContextMessage({
						goal: record.title,
						...(probe?.objective ? { objective: probe.objective } : {}),
						...(probe?.targetLevel ? { targetLevel: probe.targetLevel } : {}),
						conceptId: nodeId,
						conceptTitle: node.title,
						...(node.summary ? { conceptSummary: node.summary } : {}),
						after: tree.edges.filter((e) => e.to === nodeId).map((e) => titleOf(e.from)),
						before: tree.edges.filter((e) => e.from === nodeId).map((e) => titleOf(e.to)),
						strands: probe?.assessment?.strands ?? [],
						role: isComposite ? "plan" : "concept",
						planChatId: record.id,
						folderId,
						...(materialIds.length > 0 ? { materialIds } : {}),
					}),
				]);
				entries.push({ nodeId, title: node.title, chatId: chat.id, kind, ...(subfolderId ? { folderId: subfolderId } : {}), created: true });
			});

			const firstFresh = entries.find((e) => {
				const c = store.getChat(e.chatId);
				return c !== null && !c.messages.some((m) => (m as { role?: string }).role === "assistant");
			});
			const details: CourseOpenDetails = { folderId, entries, firstChatId: firstFresh?.chatId ?? null };
			const made = entries.filter((e) => e.created).length;
			return {
				content: [
					{
						type: "text",
						text:
							`Course opened — ${made} new chat${made === 1 ? "" : "s"} (${entries.length} concepts) in the course folder. ` +
							"The learner continues in each concept's own chat; the app takes him to the first one. Say one short closing " +
							"sentence and end your turn — never teach a concept in this plan chat.",
					},
				],
				details,
				terminate: true,
			};
		},
	};
}
