/**
 * Automatic model picks for onboarding: the learner connects one account
 * or key and Kapany fills all three model slots itself, so nobody has to
 * know what "strong / cheap / vision" means on day one. The slot pickers
 * in Settings (and the setup dialog) stay available to change them later.
 *
 * Pure, so the choice is testable without a catalog server.
 */

import type { ModelCatalogEntry, ModelSlotName } from "@/src/core";

/** Which connected source to prefer when several are connected: a paid
 *  subscription first (the learner already pays for it), then API keys,
 *  then local models (slowest, least capable). */
const PROVIDER_ORDER: readonly string[] = [
	"chatgpt",
	"github-copilot-subscription",
	"xai-subscription",
	"meta",
	"anthropic",
	"openai",
	"google",
	"ollama",
];

/** Names that mark a small, fast model — wrong for the tutor, right for
 *  the helpers. */
const SMALL = /(mini|nano|lite|flash|haiku|small|tiny|fast|contributor|\b[1-9]b\b|:[1-9]b)/i;
/** Names that mark a model nobody should get by default. */
const AVOID = /(preview|exp|experimental|deprecated|audio|realtime|tts|embed|image-gen|search)/i;

export function providerRank(provider: string): number {
	const i = PROVIDER_ORDER.indexOf(provider);
	return i === -1 ? PROVIDER_ORDER.length : i;
}

/** Higher = better for the tutor: reasoning, big context, not small,
 *  pricier (a rough proxy for capability within one provider). */
function strongScore(m: ModelCatalogEntry): number {
	return (
		(m.reasoning ? 4 : 0) +
		(SMALL.test(m.id) ? -6 : 0) +
		(AVOID.test(m.id) ? -10 : 0) +
		Math.min(m.contextWindow / 200_000, 2) +
		Math.min(m.cost.output / 20, 2)
	);
}

/** Higher = better for background helpers: small and cheap but still
 *  able to reason a little. */
function cheapScore(m: ModelCatalogEntry): number {
	return (SMALL.test(m.id) ? 4 : 0) + (m.reasoning ? 1 : 0) + (AVOID.test(m.id) ? -10 : 0) - Math.min(m.cost.output / 5, 4);
}

function best(models: readonly ModelCatalogEntry[], score: (m: ModelCatalogEntry) => number): ModelCatalogEntry | undefined {
	let top: ModelCatalogEntry | undefined;
	for (const m of models) if (!top || score(m) > score(top)) top = m;
	return top;
}

/** The connected provider onboarding builds on: the highest-ranked one
 *  that actually has models in the catalog. */
export function primaryProvider(models: readonly ModelCatalogEntry[]): string | undefined {
	const providers = [...new Set(models.map((m) => m.provider))];
	return providers.sort((a, b) => providerRank(a) - providerRank(b) || a.localeCompare(b))[0];
}

/** Fill all three slots from the catalog of connected providers. Strong
 *  and cheap come from the primary provider; vision from the primary if
 *  it can see images, else any connected provider that can, else the
 *  strong model (pictures and PDFs then fall back to text). */
export function recommendSlots(
	models: readonly ModelCatalogEntry[],
	provider = primaryProvider(models),
): Partial<Record<ModelSlotName, ModelCatalogEntry>> {
	const own = models.filter((m) => m.provider === provider);
	if (own.length === 0) return {};
	const strong = best(own, strongScore)!;
	const cheapPool = own.filter((m) => m.id !== strong.id);
	const cheap = best(cheapPool.length > 0 ? cheapPool : own, cheapScore)!;
	const seesImages = (m: ModelCatalogEntry) => m.input.includes("image");
	const vision = strong.input.includes("image")
		? strong
		: (best(own.filter(seesImages), strongScore) ??
			best(
				[...models].filter(seesImages).sort((a, b) => providerRank(a.provider) - providerRank(b.provider)),
				strongScore,
			) ??
			strong);
	return { strong, cheap, vision };
}
