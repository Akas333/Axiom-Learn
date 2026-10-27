import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { allProvidersEnabled, providerVisible } from "../src/core/provider-visibility.ts";
import { ollamaModel } from "../src/agent/ollama.ts";

describe("provider visibility", () => {
	it("shows only Meta and Ollama by default", () => {
		assert.equal(allProvidersEnabled({}), false);
		assert.equal(providerVisible("meta", {}), true);
		assert.equal(providerVisible("ollama", {}), true);
		assert.equal(providerVisible("openrouter", {}), false);
		assert.equal(providerVisible("chatgpt", {}), false);
	});

	it("AXIOM_ALL_PROVIDERS=1 shows everything", () => {
		const env = { AXIOM_ALL_PROVIDERS: "1" };
		assert.equal(allProvidersEnabled(env), true);
		assert.equal(providerVisible("openrouter", env), true);
	});
});

describe("ollama models", () => {
	it("maps /api/show details to a keyless local model", () => {
		const model = ollamaModel("http://127.0.0.1:11434", "llama3.1:8b", {
			capabilities: ["completion", "tools"],
			model_info: { "llama.context_length": 131072 },
		});
		assert.ok(model);
		assert.equal(model.provider, "ollama");
		assert.equal(model.api, "openai-completions");
		assert.equal(model.baseUrl, "http://127.0.0.1:11434/v1");
		assert.equal(model.contextWindow, 131072);
		assert.deepEqual(model.input, ["text"]);
		assert.deepEqual(model.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
		assert.equal(model.reasoning, false);
	});

	it("skips models that can't call tools", () => {
		assert.equal(ollamaModel("http://h", "gemma:2b", { capabilities: ["completion"] }), undefined);
	});

	it("marks vision and thinking models", () => {
		const model = ollamaModel("http://h", "llama4", { capabilities: ["completion", "tools", "vision", "thinking"] });
		assert.deepEqual(model?.input, ["text", "image"]);
		assert.equal(model?.reasoning, true);
	});
});

describe("the catalog with a local Ollama server", { concurrency: false }, () => {
	// A fake Ollama: one tool-capable model and one without tools.
	const server = http.createServer((req, res) => {
		res.setHeader("content-type", "application/json");
		if (req.url === "/api/tags") {
			res.end(JSON.stringify({ models: [{ name: "llama3.1:8b" }, { name: "tinyllama" }] }));
			return;
		}
		if (req.url === "/api/show") {
			let body = "";
			req.on("data", (c) => (body += c));
			req.on("end", () => {
				const { model } = JSON.parse(body) as { model: string };
				res.end(JSON.stringify({ capabilities: model === "llama3.1:8b" ? ["completion", "tools"] : ["completion"], model_info: { "llama.context_length": 8192 } }));
			});
			return;
		}
		res.statusCode = 404;
		res.end("{}");
	});
	after(() => {
		server.close();
		delete process.env.OLLAMA_HOST;
	});

	it("lists only Meta + Ollama, and Ollama's usable models", async () => {
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		process.env.OLLAMA_HOST = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		delete process.env.AXIOM_ALL_PROVIDERS;
		process.env.OPENROUTER_API_KEY ??= "test-key-hidden-provider";
		const { modelCatalog, ollamaCatalogStatus, validateModelsSettings } = await import("../src/server/model-catalog.ts");
		const status = await ollamaCatalogStatus();
		assert.equal(status.running, true);
		assert.deepEqual(status.models, ["llama3.1:8b"]);
		assert.deepEqual(status.skipped, ["tinyllama"]);

		const catalog = modelCatalog();
		assert.deepEqual(catalog.providers.map((p) => p.id), ["meta", "ollama"]);
		assert.equal(catalog.providers.find((p) => p.id === "ollama")?.keyPresent, true);
		assert.ok(catalog.models.every((m) => m.provider === "meta" || m.provider === "ollama"));
		assert.ok(catalog.models.some((m) => m.provider === "ollama" && m.id === "llama3.1:8b"));
		assert.deepEqual(validateModelsSettings({ strong: { model: { provider: "ollama", id: "llama3.1:8b" } } }), { ok: true });
	});
});
