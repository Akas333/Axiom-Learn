import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeContext, type Api, type AssistantMessage, type Message, type Model } from "@earendil-works/pi-ai";
import { piEngineForSpec, piModels } from "../src/agent/models.ts";

/*
 * Reasoning issued to another caller (2026-10-29): after a Meta key change
 * every older turn's encrypted reasoning is refused with a 400, so the chat
 * could never send again. Driven through the real Meta provider and pi-ai's
 * Responses conversion, with fetch faked.
 */

const model = piModels().getModel("meta", "muse-spark-1.3") as Model<Api>;
const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const REFUSAL = { code: null, message: "reasoning `encrypted_content` was not issued to this caller", param: null, type: "invalid_request_error" };

function turn(reasoningId: string, callId: string): Message[] {
	const assistant: AssistantMessage = {
		role: "assistant", provider: model.provider, api: model.api, model: model.id, timestamp: 1, stopReason: "toolUse", usage,
		content: [
			{ type: "thinking", thinking: "", redacted: true, thinkingSignature: JSON.stringify({ type: "reasoning", id: reasoningId, summary: [], encrypted_content: `sealed-${reasoningId}` }) },
			{ type: "toolCall", id: `${callId}|fc_${callId}`, name: "lookup", arguments: {} },
		],
	};
	return [
		assistant,
		{ role: "toolResult", toolCallId: `${callId}|fc_${callId}`, toolName: "lookup", content: [{ type: "text", text: "found" }], isError: false, timestamp: 2 },
	];
}

type Item = { type: string; id?: string; encrypted_content?: string };

/** Runs one request; every response is a 400 (the refusal while `refuse`
 *  matches a payload, a plain error otherwise) so no SSE is needed. */
async function send(messages: Message[], refuse: (input: Item[]) => boolean) {
	const payloads: Item[][] = [];
	const previousKey = process.env.META_API_KEY;
	process.env.META_API_KEY = "test-meta-key";
	try {
		const stream = piEngineForSpec({ provider: "meta", id: model.id }).streamFn(model, normalizeContext({ messages }), {
			maxRetries: 0,
			fetch: async (_url, init) => {
				const input = JSON.parse(String(init?.body)).input as Item[];
				payloads.push(input);
				const body = refuse(input) ? REFUSAL : { code: null, message: "something else", param: null, type: "invalid_request_error" };
				return new Response(JSON.stringify(body), { status: 400, headers: { "content-type": "application/json" } });
			},
		});
		const errors: string[] = [];
		for await (const event of stream) if (event.type === "error") errors.push(event.error.errorMessage ?? "");
		return { payloads, errors };
	} finally {
		if (previousKey === undefined) delete process.env.META_API_KEY;
		else process.env.META_API_KEY = previousKey;
	}
}

const hasReasoning = (input: Item[], id: string) => input.some((item) => item.type === "reasoning" && item.id === id);

test("a refused reasoning replay is resent once without that reasoning, and stays left out afterwards", async () => {
	const history: Message[] = [{ role: "user", content: "hi", timestamp: 0 }, ...turn("rs_old", "call_old"), { role: "user", content: "next", timestamp: 3 }];
	const refuseOld = (input: Item[]) => hasReasoning(input, "rs_old");

	const first = await send(history, refuseOld);
	assert.equal(first.payloads.length, 2, "one resend after the refusal");
	assert(hasReasoning(first.payloads[0]!, "rs_old"));
	assert(!first.payloads[1]!.some((item) => item.type === "reasoning"), "the resend carries no reasoning");
	// The tool call is detached from the dropped reasoning (no fc_ item id),
	// but its call and result still pair up.
	const call = first.payloads[1]!.find((item) => item.type === "function_call") as Item & { call_id: string };
	const output = first.payloads[1]!.find((item) => item.type === "function_call_output") as Item & { call_id: string };
	assert.equal(call.id, undefined);
	assert.equal(output.call_id, call.call_id);
	// The resend's own outcome reaches the caller; the refusal does not.
	assert.equal(first.errors.length, 1);
	assert.match(first.errors[0]!, /something else/);

	// Later requests leave the refused reasoning out up front, while
	// reasoning the current caller issued still replays.
	const later = await send([...history, ...turn("rs_new", "call_new"), { role: "user", content: "again", timestamp: 4 }], refuseOld);
	assert.equal(later.payloads.length, 1);
	assert(!hasReasoning(later.payloads[0]!, "rs_old"));
	assert(hasReasoning(later.payloads[0]!, "rs_new"));
	// The caller's history is never rewritten.
	assert.equal((history[1] as AssistantMessage).model, model.id);
});

test("other provider errors pass through without a resend", async () => {
	const history: Message[] = [{ role: "user", content: "hi", timestamp: 0 }, ...turn("rs_kept", "call_kept"), { role: "user", content: "next", timestamp: 3 }];
	const result = await send(history, () => false);
	assert.equal(result.payloads.length, 1);
	assert(hasReasoning(result.payloads[0]!, "rs_kept"));
	assert.match(result.errors[0]!, /something else/);
});
