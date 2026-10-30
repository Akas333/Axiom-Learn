/**
 * The probe's Switch to practice (2026-10-29): POST /api/chats/:id/mode
 * flips a concluded probe's chat to practice in place, and the choice
 * helper (probeChoicePendingOf) reads whether the learner still owes it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LhMessage } from "../src/core/native-messages.ts";
import { probeChoicePendingOf } from "../src/core/native-messages.ts";

function probeDoneMessage(id: string, recommendation: "teach" | "practice"): LhMessage {
	return {
		id,
		role: "assistant",
		content: [{
			type: "toolCall",
			id: `call_${id}`,
			name: "probe_done",
			arguments: {
				assessment: { strands: [{ strand: "Ampère's law", assessment: "Solid at JEE Advanced level." }] },
				objective: "JEE Advanced",
				targetLevel: "JEE Advanced",
				scope: "concept",
				recommendation,
				reason: "You solved the coax problem cleanly.",
			} as never,
		}],
		api: "openai-completions",
		provider: "openrouter",
		model: "test",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		stopReason: "stop",
		timestamp: Date.now(),
	} as never;
}

const userText = (id: string, text: string): LhMessage =>
	({ id, role: "user", content: [{ type: "text", text }], timestamp: Date.now() }) as never;

const modeRequest = (kind: unknown) =>
	new Request("http://test/api/chats/x/mode", { method: "POST", body: JSON.stringify({ kind }) });

describe("probeChoicePendingOf", () => {
	it("is open after a practice recommendation until the learner says anything", () => {
		const done = probeDoneMessage("m1", "practice");
		assert.equal(probeChoicePendingOf([done]), true);
		assert.equal(probeChoicePendingOf([done, userText("u1", "Teach me anyway")]), false);
	});

	it("is closed after a teach recommendation, and before any probe", () => {
		assert.equal(probeChoicePendingOf([probeDoneMessage("m1", "teach")]), false);
		assert.equal(probeChoicePendingOf([userText("u1", "Teach me Ampère's law")]), false);
	});
});

describe("POST /api/chats/:id/mode", () => {
	it("flips a concluded probe's chat to practice in place, keeping the probe history", async () => {
		const { stores } = await import("../src/server/index.ts");
		const route = await import("../src/http/routes/chats-id-mode.ts");
		const chat = stores.chatStore.createChat("Ampère's law");
		stores.chatStore.saveMessages(chat.id, [userText("u0", "Ampère's law"), probeDoneMessage("m1", "practice")]);

		const res = await route.POST(modeRequest("practice"), { params: Promise.resolve({ id: chat.id }) });
		assert.equal(res.status, 200);
		const record = stores.chatStore.getChat(chat.id)!;
		assert.equal(record.kind, "practice");
		assert.equal(record.messages.length, 2, "the probe stays as the practitioner's calibration");
	});

	it("refuses before the probe has concluded, and rejects any other kind", async () => {
		const { stores } = await import("../src/server/index.ts");
		const route = await import("../src/http/routes/chats-id-mode.ts");
		const chat = stores.chatStore.createChat("Still probing");
		stores.chatStore.saveMessages(chat.id, [userText("u0", "Ampère's law")]);

		const early = await route.POST(modeRequest("practice"), { params: Promise.resolve({ id: chat.id }) });
		assert.equal(early.status, 409);
		const wrong = await route.POST(modeRequest("teach"), { params: Promise.resolve({ id: chat.id }) });
		assert.equal(wrong.status, 400);
		const missing = await route.POST(modeRequest("practice"), { params: Promise.resolve({ id: "chat_missing" }) });
		assert.equal(missing.status, 404);
		assert.equal(stores.chatStore.getChat(chat.id)!.kind, undefined);
	});
});
