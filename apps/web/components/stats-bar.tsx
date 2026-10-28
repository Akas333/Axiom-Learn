
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { Popover } from "@astryxdesign/core/Popover";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { List, ListItem } from "@astryxdesign/core/List";
import { Link } from "@astryxdesign/core/Link";
import { Button } from "@astryxdesign/core/Button";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { subscriptionLabels, subscriptionLabel, type SessionPricing, type TurnUsage } from "@/src/core";
import { formatTokens, formatUsd, planCostLabel, prettyModel } from "@/components/usage-format";
import { ModelControl, catalogLimits, useModelCatalog } from "@/components/model-picker";

/** How full the context window is, as a small ring (empty when unknown). */
function ContextRing({ tokens, limit, label }: { tokens: number | null; limit: number | null; label: string }) {
	const share = tokens !== null && limit ? Math.min(Math.max(tokens / limit, 0), 1) : 0;
	const r = 8;
	const c = 2 * Math.PI * r;
	return (
		<span
			role="img"
			aria-label={`Context used: ${label}`}
			title={`Context: ${label}`}
			data-testid="context-ring"
			className="flex size-6 items-center justify-center"
		>
			<svg viewBox="0 0 20 20" className="size-5 -rotate-90">
				<circle cx="10" cy="10" r={r} fill="none" stroke="var(--color-border-emphasized)" strokeWidth="2.5" />
				<circle
					cx="10"
					cy="10"
					r={r}
					fill="none"
					stroke={share > 0.85 ? "var(--color-error)" : "var(--color-accent)"}
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeDasharray={`${share * c} ${c}`}
				/>
			</svg>
		</span>
	);
}

export function formatContextMeasurement(tokens: number | null, limit: number | null): string {
	const numerator = tokens === null ? "?" : formatTokens(tokens);
	return limit === null ? numerator : `${numerator} / ${formatTokens(limit)}`;
}

/**
 * The below-composer stats bar (wave 4 observability): the session's
 * money/context footprint as one quiet row beneath the composer —
 * LEFT-aligned: context window + session cost; RIGHT-aligned: model +
 * thinking level. Clicking the left side opens the per-turn detail popover.
 *
 *  Pre-chat views (home, /chat/new) render NO left side at all (owner,
 *  wave 7 sweep: the knowledge-context budget slider that used to live
 *  there died with the injection; a "— · —" summary over an empty
 *  popover is pure noise) — the dictation strip's middle simply widens.
 *
 * Spending arrives already priced by the server through Pi's catalog and
 * calculator. Missing cost stays "—", never fake zero. Context is a separate
 * completed-conversation measurement, never a money-log/summarizer fold or
 * transcript estimate. Its catalog denominator follows the selected model;
 * model changes preserve the numerator. Successful compaction clears it to ?.
 */
export function StatsBar({
	turns,
	contextTokens = null,
	pricing,
	chatId,
	leadingSlot,
}: {
	turns: TurnUsage[];
	contextTokens?: number | null;
	pricing?: SessionPricing;
	/** The bound session (per-session models, owner 2026-09-28): present
	 *  on the in-session bar — the model control binds THE SESSION'S own
	 *  record; absent on the draft surfaces, where it binds the strong
	 *  slot (the new-session default). */
	chatId?: string;
	/** The row's LEFT edge (practice sessions, 2026-10-04): the home
	 *  composer's teach | practice switch rides here — before the session
	 *  data (which renders nothing pre-chat on that surface). */
	leadingSlot?: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [selectedModel, setSelectedModel] = useState<string | undefined>();
	// Same dropdown discipline as the model control (owner, df4433f treatment,
	// stats round 1): close on any pointerdown outside the bar or on Escape.
	// Catalog-only denominator; the picker reports its effective selection.
	// Missing/pending catalog means usage-only, never a hardcoded maximum.
	const { catalog } = useModelCatalog();
	const limits = useMemo(() => (catalog ? catalogLimits(catalog) : undefined), [catalog]);
	const limit = selectedModel ? limits?.get(selectedModel) ?? null : null;
	const contextLabel = formatContextMeasurement(contextTokens, limit);
	const { cost = 0, unpriced = turns.length, subscription = 0 } = pricing ?? {};
	// Honest cost: show dollars only when at least one turn priced;
	// otherwise "—" (never a fake $0.0000).
	const pricedCount = turns.length - unpriced - subscription;
	const providers = pricing?.subscriptionProviders ?? subscriptionLabels(turns.map((turn) => turn.model));
	const costLabel = planCostLabel(pricedCount > 0 ? cost : null, providers);

	return (
		<div
			data-testid="stats-bar"
			// pointer-events-auto: the sticky composer wrapper is pointer-events-none
			// (so its transparent gradient area never blocks scrolling) — this row
			// must re-enable events or every control on it is dead (the model-
			// control wave caught this live: buttons rendered, clicks never landed).
			className="pointer-events-auto relative flex items-center justify-between gap-2 px-2 pt-2.5 sm:gap-3 sm:px-4 text-sm text-secondary"
		>
			{/* The summary button + its popover: the popover anchors to this
			    wrapper, CENTERED over the button itself (owner, stats round 2)
			    — not over the whole bar row, which made it line up oddly. The
			    outside-close ref anchors HERE too (owner, round 3): on the whole
			    bar it wrapped the model control, so clicking model/thinking never
			    counted as outside — the asymmetry the owner observed. */}
			{/* The leading slot (2026-10-04): the leftmost control surface —
			    the home composer's mode switch. */}
			{leadingSlot}
			{/* The left side: the session-data summary — only once a session
			    exists (turns). Pre-chat renders nothing (see the header). */}
			{(chatId || turns.length > 0) && (
			<Popover
				isOpen={open}
				onOpenChange={setOpen}
				placement="above"
				width={288}
				label="Session stats"
				content={
					<VStack gap={3} data-testid="stats-detail">
						<MetadataList title="Session stats">
							<MetadataListItem label="Context (last call)">{contextLabel}</MetadataListItem>
							<MetadataListItem label={subscription ? "Usage" : "Total cost"}>{costLabel}</MetadataListItem>
							{unpriced > 0 && <MetadataListItem label="Unpriced turns">{String(unpriced)}</MetadataListItem>}
						</MetadataList>
						{providers.includes("ChatGPT") && (
							<Link href="https://chatgpt.com/settings/usage" target="_blank">
								Manage ChatGPT usage
							</Link>
						)}
						{turns.length > 0 && (
							<List header={<Text type="label" color="secondary">Turns</Text>} density="compact" className="max-h-56 overflow-y-auto">
								{turns.map((turn, i) => {
									const c = pricing?.turnCosts[turn.id] ?? null;
									return (
										<ListItem
											key={`${turn.messageId}-${i}`}
											label={`#${i + 1} · ${prettyModel(turn.model, true)}`}
											description={`${turn.steps.length} steps`}
											endContent={<Text type="body" hasTabularNumbers>{subscriptionLabel(turn.model) ?? (c === null ? "—" : formatUsd(c))}</Text>}
										/>
									);
								})}
							</List>
						)}
					</VStack>
				}
			>
				<Button variant="secondary" size="sm" label={`${contextLabel} · ${costLabel}`} data-testid="stats-summary" />
			</Popover>
			)}
			{/* Dictation lives inside the input itself now (the mic + meter
			    in the composer pill and the thinking fields). */}
			<div className="flex-1" />
			{/* The model + thinking control — one controller for the conversation
			    agents (prober/teacher); the record's `turns` above still folds
			    the ACTUAL models billed, regardless of what the picker says. */}
			<div className="flex min-w-0 items-center gap-2.5">
				<ModelControl chatId={chatId} onModelChange={setSelectedModel} variant="combined" />
				{(chatId || turns.length > 0) && <ContextRing tokens={contextTokens} limit={limit} label={contextLabel} />}
			</div>
		</div>
	);
}
