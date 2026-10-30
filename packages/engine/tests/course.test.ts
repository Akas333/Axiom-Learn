/**
 * COURSES (2026-10-29): course_open turns a confirmed course plan into a
 * folder — this chat as its plan chat, one chat per concept (practice for
 * the held ones), a subfolder with its own plan chat per composite
 * concept, each seeded with a course-context marker — and re-calling it
 * syncs without duplicates. courseEntries reads the folder back in
 * teaching order with each chat's status.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LhMessage } from "../src/core/native-messages.ts";
import { courseOrder } from "../src/core/course.ts";
import { courseOpenTool, courseTools, type CourseOpenDetails } from "../src/agent/tools/course.ts";

const STAMPS = {
	api: "faux",
	provider: "test",
	model: "test-model",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason: "toolUse",
} as const;

function probeDone(scope: "concept" | "course"): LhMessage[] {
	return [
		{
			id: "m_probe",
			role: "assistant",
			content: [{
				type: "toolCall",
				id: "call_probe",
				name: "probe_done",
				arguments: {
					assessment: { strands: [{ strand: "Biot–Savart law", assessment: "Solid at JEE Advanced level." }] },
					objective: "JEE Advanced",
					targetLevel: "JEE Advanced",
					scope,
					recommendation: "teach",
					reason: "Several concepts are new.",
				},
			}],
			timestamp: 1,
			...STAMPS,
		} as never,
		{ id: "r_probe", role: "toolResult", toolCallId: "call_probe", toolName: "probe_done", content: [{ type: "text", text: "ok" }], details: { ok: true }, isError: false, timestamp: 2 } as never,
	];
}

const TREE = {
	nodes: [
		{ id: "biot-savart", title: "Biot–Savart law" },
		{ id: "ampere", title: "Ampère's law" },
		{ id: "force", title: "Force on a current" },
		{ id: "solenoid", title: "Solenoids and toroids" },
	],
	edges: [
		{ from: "biot-savart", to: "ampere" },
		{ from: "ampere", to: "solenoid" },
		{ from: "biot-savart", to: "force" },
	],
	version: 1,
};

describe("courseOrder", () => {
	it("puts prerequisites first and keeps plan order among ready nodes", () => {
		assert.deepEqual(courseOrder(TREE), ["biot-savart", "ampere", "force", "solenoid"]);
	});
});

describe("course_open", () => {
	it("is offered only in a course-scope chat", async () => {
		const { stores } = await import("../src/server/index.ts");
		const concept = stores.chatStore.createChat("Ampère's law");
		stores.chatStore.saveMessages(concept.id, probeDone("concept"));
		assert.deepEqual(Object.keys(courseTools({ chatId: concept.id, chatStore: stores.chatStore })), []);
		const course = stores.chatStore.createChat("Magnetic effects of current");
		stores.chatStore.saveMessages(course.id, probeDone("course"));
		assert.deepEqual(Object.keys(courseTools({ chatId: course.id, chatStore: stores.chatStore })), ["course_open"]);
	});

	it("builds the course folder, concept chats, a practice chat and a composite subfolder — and re-syncs idempotently", async () => {
		const { stores, courseEntries } = await import("../src/server/index.ts");
		const store = stores.chatStore;
		const plan = store.createChat("Magnetic effects of current", undefined, "textbook");
		store.saveMessages(plan.id, probeDone("course"));
		store.saveTree(plan.id, TREE);
		const tool = courseOpenTool({ chatId: plan.id, chatStore: store, materialIdsFor: () => ["mat_1"] });

		const res = await tool.execute("t1", { practiceNodeIds: ["biot-savart"], compositeNodeIds: ["force"] });
		assert.equal(res.terminate, true);
		const details = res.details as CourseOpenDetails;
		assert.equal(details.entries.length, 4);
		assert.deepEqual(details.entries.map((e) => e.nodeId), ["biot-savart", "ampere", "force", "solenoid"]);

		// The plan chat moved into the course folder as its plan chat.
		const folder = store.listFolders().find((f) => f.id === details.folderId)!;
		assert.equal(folder.name, "Magnetic effects of current");
		assert.equal(folder.planChatId, plan.id);
		assert.equal(store.getChat(plan.id)!.folderId, folder.id);
		assert.equal(store.getChat(plan.id)!.course?.role, "plan");

		const byNode = new Map(details.entries.map((e) => [e.nodeId, e]));
		const ampere = store.getChat(byNode.get("ampere")!.chatId)!;
		assert.equal(ampere.style, "textbook", "the style carries over");
		assert.equal(ampere.folderId, folder.id);
		assert.deepEqual(ampere.course, { role: "concept", folderId: folder.id, planChatId: plan.id, conceptId: "ampere", order: 1 });
		const seed = ampere.messages[0] as { customType?: string; content?: string };
		assert.equal(seed.customType, "course-context");
		assert.match(seed.content!, /Ampère's law/);
		assert.match(seed.content!, /Comes after: Biot–Savart law/);
		assert.match(seed.content!, /JEE Advanced/);
		assert.match(seed.content!, /mat_1/);

		assert.equal(store.getChat(byNode.get("biot-savart")!.chatId)!.kind, "practice");

		const force = byNode.get("force")!;
		assert.ok(force.folderId, "a composite concept gets a subfolder");
		const sub = store.listFolders().find((f) => f.id === force.folderId)!;
		assert.equal(sub.parentId, folder.id);
		assert.equal(sub.planChatId, force.chatId);
		assert.equal(store.getChat(force.chatId)!.course?.parentPlanChatId, plan.id);

		assert.equal(details.firstChatId, byNode.get("biot-savart")!.chatId);

		// Re-calling syncs: nothing new is created.
		const again = await tool.execute("t2", {});
		const againDetails = again.details as CourseOpenDetails;
		assert.equal(againDetails.folderId, folder.id);
		assert.ok(againDetails.entries.every((e) => !e.created));
		assert.equal(store.listFolders().filter((f) => f.planChatId === plan.id).length, 1);

		// The folder reads back in teaching order, all not started.
		const course = courseEntries(folder.id)!;
		assert.equal(course.planChatId, plan.id);
		assert.deepEqual(course.entries.map((e) => [e.nodeId, e.status]), [
			["biot-savart", "not-started"],
			["ampere", "not-started"],
			["force", "not-started"],
			["solenoid", "not-started"],
		]);
	});

	it("marks a concept done once its chat closes with nothing next", async () => {
		const { stores, courseEntries } = await import("../src/server/index.ts");
		const store = stores.chatStore;
		const plan = store.createChat("Electrostatics");
		store.saveMessages(plan.id, probeDone("course"));
		store.saveTree(plan.id, { nodes: [{ id: "gauss", title: "Gauss's law" }], edges: [], version: 1 });
		const res = await courseOpenTool({ chatId: plan.id, chatStore: store }).execute("t1", {});
		const { folderId, entries } = res.details as CourseOpenDetails;
		const chatId = entries[0]!.chatId;
		const record = store.getChat(chatId)!;
		store.saveMessages(chatId, [
			...record.messages,
			{ id: "m_done", role: "assistant", content: [{ type: "toolCall", id: "call_done", name: "concept_done", arguments: { nodeId: "x", recap: ["r"] } }], timestamp: 3, ...STAMPS } as never,
			{ id: "r_done", role: "toolResult", toolCallId: "call_done", toolName: "concept_done", content: [{ type: "text", text: "ok" }], details: {}, isError: false, timestamp: 4 } as never,
		]);
		assert.equal(courseEntries(folderId)!.entries[0]!.status, "done");
	});
});
