/**
 * Which model providers the app shows.
 *
 * By default only Meta (Muse models through the Meta Model API) and Ollama
 * (local open-weights models) are offered. Every other provider still works
 * underneath; set AXIOM_ALL_PROVIDERS=1 to show them again in Settings, the
 * setup screen and the model pickers.
 *
 * Keys already saved for hidden providers are never deleted, and they stay
 * listed on the Keys page so nothing disappears silently.
 */

export const FEATURED_PROVIDERS: readonly string[] = ["meta", "ollama"];

export function allProvidersEnabled(env: Record<string, string | undefined> = process.env): boolean {
	return env.AXIOM_ALL_PROVIDERS === "1";
}

export function providerVisible(id: string, env: Record<string, string | undefined> = process.env): boolean {
	return allProvidersEnabled(env) || FEATURED_PROVIDERS.includes(id);
}
