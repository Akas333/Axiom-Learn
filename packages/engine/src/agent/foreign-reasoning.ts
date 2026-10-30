import type { Api, AssistantMessage, AssistantMessageEvent, Model, SimpleStreamOptions, StreamFunction, TranscriptContext } from "@earendil-works/pi-ai";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";

/**
 * Reasoning issued to another caller (2026-10-29). OpenAI-style Responses
 * providers return each turn's reasoning encrypted, and pi-ai replays it
 * on the next request to the same model. The provider only accepts
 * reasoning it issued to the SAME caller: once the API key or account
 * changes, every older turn is refused — Meta answers 400 "reasoning
 * `encrypted_content` was not issued to this caller" — and the chat can
 * never send again.
 *
 * The fallback: resend once with that history's reasoning left out, and
 * remember the refused signatures so later requests in this process leave
 * them out up front. Reasoning the current caller issues from then on
 * still replays.
 */
const FOREIGN_REASONING =
	/encrypted[_ ]content`? (?:was )?not issued to this caller|encrypted[_ ]content.{0,120}could not be (?:verified|decrypted)/i;

/** Refused reasoning, by its reasoning item id (the signature itself when it has none). */
const refused = new Set<string>();

function signatureKey(signature: string): string {
	try {
		const id = (JSON.parse(signature) as { id?: unknown }).id;
		if (typeof id === "string" && id) return id;
	} catch {}
	return signature;
}

function signaturesOf(message: AssistantMessage): string[] {
	return message.content.flatMap((block) =>
		block.type === "thinking" && block.thinkingSignature ? [block.thinkingSignature] : [],
	);
}

/**
 * The request-only view of `context` with refused reasoning left out
 * (`refuseAll`: every replayable signature in it is refused first). A turn
 * is replayed the way pi-ai replays another model's turn — reasoning
 * dropped, its text and tool-call item ids detached from it — so the
 * provider never sees an item paired with reasoning it was not sent. The
 * stored record is untouched.
 */
export function withoutRefusedReasoning(context: TranscriptContext, model: Model<Api>, refuseAll = false): TranscriptContext {
	let changed = false;
	const messages = context.messages.map((message) => {
		if (message.role !== "assistant") return message;
		if (message.provider !== model.provider || message.api !== model.api || message.model !== model.id) return message;
		const signatures = signaturesOf(message);
		if (signatures.length === 0) return message;
		if (refuseAll) for (const signature of signatures) refused.add(signatureKey(signature));
		else if (!signatures.some((signature) => refused.has(signatureKey(signature)))) return message;
		changed = true;
		return { ...message, model: `${message.model} (another caller)` };
	});
	return changed ? { ...context, messages } : context;
}

/** Wraps an API-key stream with the one-shot resend described above. */
export function withForeignReasoningFallback(
	stream: StreamFunction<Api, SimpleStreamOptions>,
): StreamFunction<Api, SimpleStreamOptions> {
	return (model, context, options) => {
		const output = new AssistantMessageEventStream();
		void (async () => {
			try {
				const first = withoutRefusedReasoning(context, model);
				let refusal: AssistantMessageEvent | undefined;
				for await (const event of stream(model, first, options)) {
					// Request setup fails with a lone error event (no start), so
					// nothing has reached the caller when the refusal arrives.
					if (event.type === "error" && FOREIGN_REASONING.test(event.error.errorMessage ?? "")) {
						refusal = event;
						break;
					}
					output.push(event);
				}
				if (!refusal) return;
				const retry = withoutRefusedReasoning(first, model, true);
				if (retry === first) {
					output.push(refusal);
					return;
				}
				for await (const event of stream(model, retry, options)) output.push(event);
			} finally {
				output.end();
			}
		})();
		return output;
	};
}
