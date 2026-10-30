/**
 * Idle extraction: a session below the chunk budget still reaches the graph
 * once it goes quiet (scheduleIdleExtraction in server/turn-service.ts).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtractionPipeline } from "../src/agent/subagents/extraction.ts";
import type { ChatStore, GraphStore } from "../src/core/ports.ts";
import { beginTurn, endTurn } from "../src/server/turn-liveness.ts";
import { cancelIdleExtraction, IDLE_EXTRACTION_MIN_TOKENS, scheduleIdleExtraction } from "../src/server/turn-service.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A chat whose only message is `words` words of teacher prose. */
function storesWith(chatId: string, words: number) {
	const text = Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
	const record = {
		id: chatId,
		title: "Tides",
		messages: [
			{
				id: "m1",
				role: "assistant",
				content: [{ type: "text", text }],
				api: "openai-responses",
				provider: "meta",
				model: "test",
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				stopReason: "stop",
				timestamp: Date.now(),
			},
		],
	};
	return {
		chatStore: { getChat: (id: string) => (id === chatId ? record : null) } as unknown as ChatStore,
		graphStore: { readCoverage: () => [] } as unknown as GraphStore,
	};
}

function countingPipeline() {
	const runs: string[] = [];
	const extraction = {
		runExtraction: async (chatId: string) => {
			runs.push(chatId);
			return { nodes: 0, chains: 0 };
		},
	} as unknown as ExtractionPipeline;
	return { runs, extraction };
}

describe("idle extraction", () => {
	it("extracts a quiet session's leftover prose after the delay", async () => {
		const { runs, extraction } = countingPipeline();
		scheduleIdleExtraction(storesWith("c1", 600), extraction, "c1", 20);
		assert.deepEqual(runs, [], "nothing runs before the session is quiet");
		await wait(60);
		assert.deepEqual(runs, ["c1"]);
	});

	it("skips sessions with too little new prose to be worth a call", async () => {
		assert.ok(IDLE_EXTRACTION_MIN_TOKENS > 5);
		const { runs, extraction } = countingPipeline();
		scheduleIdleExtraction(storesWith("c2", 3), extraction, "c2", 20);
		await wait(60);
		assert.deepEqual(runs, []);
	});

	it("each new turn pushes the timer back, so a busy session runs once", async () => {
		const { runs, extraction } = countingPipeline();
		const stores = storesWith("c3", 600);
		scheduleIdleExtraction(stores, extraction, "c3", 40);
		await wait(20);
		scheduleIdleExtraction(stores, extraction, "c3", 40);
		await wait(25);
		assert.deepEqual(runs, [], "the first timer was replaced");
		await wait(40);
		assert.deepEqual(runs, ["c3"]);
	});

	it("waits for a running turn: it re-arms when that turn ends", async () => {
		const { runs, extraction } = countingPipeline();
		beginTurn("c4");
		try {
			scheduleIdleExtraction(storesWith("c4", 600), extraction, "c4", 20);
			await wait(60);
			assert.deepEqual(runs, []);
		} finally {
			endTurn("c4");
		}
	});

	it("can be cancelled", async () => {
		const { runs, extraction } = countingPipeline();
		scheduleIdleExtraction(storesWith("c5", 600), extraction, "c5", 20);
		cancelIdleExtraction("c5");
		await wait(60);
		assert.deepEqual(runs, []);
	});
});
