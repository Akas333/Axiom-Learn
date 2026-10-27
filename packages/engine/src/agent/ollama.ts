/**
 * Ollama — local models with no API key (Meta's open-weights Llama models
 * running on the learner's machine).
 *
 * Ollama has no fixed catalog, so the model list comes from the running
 * Ollama server (`/api/tags`, then `/api/show` per model for its context
 * size and capabilities). Requests go through Ollama's OpenAI-compatible
 * endpoint (`/v1/chat/completions`) via pi-ai's openai-completions API.
 *
 * Only models that support tool calls are listed: every Kapany agent uses
 * tools, and a model without them would fail mid-lesson.
 *
 * The server address comes from OLLAMA_HOST (Ollama's own variable),
 * default http://127.0.0.1:11434.
 */

import { createProvider, type Model, type MutableModels } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

export const OLLAMA_PROVIDER_ID = "ollama";

/** How long to wait for a local Ollama server before treating it as off. */
const PROBE_TIMEOUT_MS = 1500;
/** Used when Ollama doesn't report a context size. */
const FALLBACK_CONTEXT = 8192;

export function ollamaHost(): string {
	const raw = process.env.OLLAMA_HOST?.trim() || "http://127.0.0.1:11434";
	const withScheme = /^https?:\/\//.test(raw) ? raw : `http://${raw}`;
	return withScheme.replace(/\/+$/, "");
}

export interface OllamaStatus {
	host: string;
	/** The Ollama server answered. */
	running: boolean;
	/** Tool-capable models found (the ones Kapany can use). */
	models: string[];
	/** Pulled models skipped because they can't call tools. */
	skipped: string[];
}

let status: OllamaStatus = { host: ollamaHost(), running: false, models: [], skipped: [] };
let inFlight: Promise<OllamaStatus> | undefined;

export function ollamaStatus(): OllamaStatus {
	return status;
}

/** True when Ollama is running with at least one usable model. */
export function ollamaAvailable(): boolean {
	return status.running && status.models.length > 0;
}

interface TagsResponse {
	models?: { name: string; model?: string }[];
}
interface ShowResponse {
	capabilities?: string[];
	model_info?: Record<string, unknown>;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, { ...init, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
	if (!res.ok) throw new Error(`${url} → ${res.status}`);
	return (await res.json()) as T;
}

function contextLength(info: Record<string, unknown> | undefined): number {
	if (!info) return FALLBACK_CONTEXT;
	for (const [key, value] of Object.entries(info)) {
		if (key.endsWith(".context_length") && typeof value === "number" && value > 0) return value;
	}
	return FALLBACK_CONTEXT;
}

/** Build one pi-ai model from an Ollama model's `/api/show` details. */
export function ollamaModel(host: string, name: string, show: ShowResponse): Model<"openai-completions"> | undefined {
	const caps = show.capabilities ?? [];
	// Older Ollama builds don't report capabilities; let those through.
	if (show.capabilities && !caps.includes("tools")) return undefined;
	const contextWindow = contextLength(show.model_info);
	return {
		id: name,
		name: `${name} (local)`,
		api: "openai-completions",
		provider: OLLAMA_PROVIDER_ID,
		baseUrl: `${host}/v1`,
		input: caps.includes("vision") ? ["text", "image"] : ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		reasoning: caps.includes("thinking"),
		contextWindow,
		maxTokens: Math.min(8192, contextWindow),
		compat: {
			supportsStore: false,
			supportsDeveloperRole: false,
			maxTokensField: "max_tokens",
		},
	};
}

function ollamaProvider(host: string, models: Model<"openai-completions">[]) {
	return createProvider({
		id: OLLAMA_PROVIDER_ID,
		name: "Ollama (local)",
		baseUrl: `${host}/v1`,
		auth: {
			apiKey: {
				name: "Ollama (no key needed)",
				// Keyless: Ollama ignores the key, but the OpenAI client wants one.
				resolve: async () => ({ auth: { apiKey: "ollama" }, source: "local" }),
			},
		},
		models,
		api: openAICompletionsApi(),
	});
}

/**
 * Ask the local Ollama server which models it has and register them with
 * pi-ai. Never throws: a stopped server just means "no local models". The
 * last good list is kept while a refresh is running.
 */
export function refreshOllamaModels(collection: MutableModels): Promise<OllamaStatus> {
	if (inFlight) return inFlight;
	inFlight = (async () => {
		const host = ollamaHost();
		// Tests make no network calls unless one points OLLAMA_HOST at a fake server.
		if (process.env.NODE_ENV === "test" && !process.env.OLLAMA_HOST) {
			status = { host, running: false, models: [], skipped: [] };
			return status;
		}
		try {
			const tags = await getJson<TagsResponse>(`${host}/api/tags`);
			const names = (tags.models ?? []).map((m) => m.name || m.model || "").filter(Boolean);
			const details = await Promise.all(
				names.map((name) =>
					getJson<ShowResponse>(`${host}/api/show`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ model: name }),
					}).catch(() => ({}) as ShowResponse),
				),
			);
			const models: Model<"openai-completions">[] = [];
			const skipped: string[] = [];
			names.forEach((name, i) => {
				const model = ollamaModel(host, name, details[i]!);
				if (model) models.push(model);
				else skipped.push(name);
			});
			collection.setProvider(ollamaProvider(host, models));
			status = { host, running: true, models: models.map((m) => m.id), skipped };
		} catch {
			// Server not running: keep any models found earlier registered so a
			// lesson already pinned to one fails with Ollama's own error, not
			// "unknown model".
			status = { ...status, host, running: false };
		}
		return status;
	})().finally(() => {
		inFlight = undefined;
	});
	return inFlight;
}
