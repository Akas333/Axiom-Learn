import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ModelCatalogEntry } from "@/src/core";
import { primaryProvider, recommendSlots } from "@/components/onboarding-picks";

function model(provider: string, id: string, extra: Partial<ModelCatalogEntry> = {}): ModelCatalogEntry {
	return {
		id,
		name: id,
		provider,
		reasoning: false,
		input: ["text"],
		supportedLevels: [],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 8_000,
		...extra,
	};
}

describe("onboarding model picks", () => {
	it("prefers a subscription over an API key", () => {
		const models = [model("meta", "muse-spark-1.3"), model("chatgpt", "gpt-5.5")];
		assert.equal(primaryProvider(models), "chatgpt");
	});

	it("puts the big model on strong and the small one on cheap", () => {
		const picks = recommendSlots([
			model("openai", "gpt-5.5-mini", { cost: { input: 0.2, output: 1, cacheRead: 0, cacheWrite: 0 } }),
			model("openai", "gpt-5.5", { reasoning: true, input: ["text", "image"], cost: { input: 2, output: 10, cacheRead: 0, cacheWrite: 0 } }),
		]);
		assert.equal(picks.strong?.id, "gpt-5.5");
		assert.equal(picks.cheap?.id, "gpt-5.5-mini");
		assert.equal(picks.vision?.id, "gpt-5.5");
	});

	it("borrows another connected provider for vision when the primary is text-only", () => {
		const picks = recommendSlots([model("ollama", "llama3.1:8b"), model("google", "gemini-3-pro", { input: ["text", "image"] })], "ollama");
		assert.equal(picks.strong?.id, "llama3.1:8b");
		assert.equal(picks.cheap?.id, "llama3.1:8b");
		assert.equal(picks.vision?.provider, "google");
	});

	it("falls back to the strong model when nothing can see images", () => {
		const picks = recommendSlots([model("ollama", "llama3.1:8b")]);
		assert.equal(picks.vision?.id, "llama3.1:8b");
	});

	it("returns nothing for an empty catalog", () => {
		assert.deepEqual(recommendSlots([]), {});
	});
});
