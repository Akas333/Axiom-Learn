/**
 * The app's pickers — model, thinking level, provider, reading font —
 * as Astryx Selectors with search. Each maps app data to Selector
 * options; the Selector owns the trigger, the menu, search, keyboard and
 * focus.
 */

import { Selector } from "@astryxdesign/core/Selector";
import type { ModelCatalogEntry } from "@/src/core";
import { subscriptionLabel } from "@/src/core";
import { formatTokens } from "@/components/usage-format";

type SelectorSize = "sm" | "md" | "lg";

function priceLabel(cost: ModelCatalogEntry["cost"]): string {
	const fmt = (n: number) => `$${n < 1 ? n.toFixed(2).replace(/0$/, "") : n.toFixed(2)}`;
	return `${fmt(cost.input)}/${fmt(cost.output)}`;
}

/** Stable option value for a catalog entry (ids can repeat across providers). */
export function modelKey(m: { provider: string; id: string }): string {
	return `${m.provider}\u0000${m.id}`;
}

export function ModelSelector({
	label,
	models,
	value,
	onChange,
	placeholder = "Pick a model…",
	emptyText,
	size = "sm",
	width,
	isDisabled,
	testid,
	variant = "input",
	placement,
}: {
	/** Accessible name (hidden visually). */
	label: string;
	/** The catalog; undefined while it loads. */
	models: ModelCatalogEntry[] | undefined;
	value: { provider: string; id: string } | undefined;
	onChange: (entry: ModelCatalogEntry) => void;
	placeholder?: string;
	/** Shown when the catalog is empty (e.g. no vision models). */
	emptyText?: string;
	size?: SelectorSize;
	width?: number | string;
	isDisabled?: boolean;
	testid?: string;
	variant?: "input" | "secondary" | "ghost";
	/** Where the menu opens; "above" for controls at the bottom of the screen. */
	placement?: "above" | "below";
}) {
	const byKey = new Map((models ?? []).map((m) => [modelKey(m), m]));
	return (
		<Selector
			placement={placement}
			label={label}
			isLabelHidden
			size={size}
			variant={variant}
			width={width}
			hasSearch
			searchPlaceholder="Search models…"
			placeholder={placeholder}
			isLoading={models === undefined}
			isDisabled={isDisabled}
			emptyText={emptyText ?? "No models."}
			emptySearchText="No models match."
			data-testid={testid}
			value={value ? modelKey(value) : undefined}
			onChange={(key) => {
				const entry = key ? byKey.get(key) : undefined;
				if (entry) onChange(entry);
			}}
			options={(models ?? []).map((m) => {
				const sub = subscriptionLabel(`${m.provider}:${m.id}`);
				return {
					value: modelKey(m),
					label: m.name,
					description: `${sub ? `${sub} (subscription)` : m.provider} · ${m.id} · ${formatTokens(m.contextWindow)} · ${sub ?? priceLabel(m.cost)}`,
				};
			})}
			renderValue={(option) => byKey.get(option.value)?.name ?? option.value}
		/>
	);
}

export function ThinkingSelector({
	label,
	levels,
	value,
	onChange,
	format = (level) => level,
	placeholder = "—",
	size = "sm",
	width,
	isDisabled,
	testid,
	variant = "input",
	placement,
}: {
	label: string;
	/** The levels the chosen model supports. */
	levels: readonly string[];
	value: string | undefined;
	onChange: (level: string) => void;
	format?: (level: string) => string;
	placeholder?: string;
	size?: SelectorSize;
	width?: number | string;
	isDisabled?: boolean;
	testid?: string;
	variant?: "input" | "secondary" | "ghost";
	/** Where the menu opens; "above" for controls at the bottom of the screen. */
	placement?: "above" | "below";
}) {
	return (
		<Selector
			placement={placement}
			label={label}
			isLabelHidden
			size={size}
			variant={variant}
			width={width}
			placeholder={placeholder}
			isDisabled={isDisabled || levels.length === 0}
			emptyText="No thinking levels."
			data-testid={testid}
			value={value}
			onChange={(level) => level && onChange(level)}
			options={levels.map((level) => ({ value: level, label: format(level) }))}
		/>
	);
}

export type ProviderOption = { id: string; envVar: string; label: string };

export function ProviderSelector({
	label,
	providers,
	value,
	onChange,
	placeholder = "Pick a provider…",
	size = "sm",
	width,
	testid,
}: {
	label: string;
	providers: readonly ProviderOption[];
	value: string | undefined;
	onChange: (provider: ProviderOption) => void;
	placeholder?: string;
	size?: SelectorSize;
	width?: number | string;
	testid?: string;
}) {
	const byId = new Map(providers.map((p) => [p.id, p]));
	return (
		<Selector
			label={label}
			isLabelHidden
			size={size}
			width={width}
			hasSearch
			searchPlaceholder="Search providers…"
			placeholder={placeholder}
			emptyText="No providers left to add."
			emptySearchText="No providers match."
			data-testid={testid}
			value={value}
			onChange={(id) => {
				const p = id ? byId.get(id) : undefined;
				if (p) onChange(p);
			}}
			options={providers.map((p) => ({ value: p.id, label: p.label, description: p.envVar }))}
		/>
	);
}

/** The value standing for "the factory reading font". */
const DEFAULT_FONT = "\u0000default";

export function FontSelector({
	label,
	defaultFamily,
	families,
	value,
	onChange,
	size = "sm",
	width,
	testid,
	description,
	onOpen,
}: {
	label: string;
	/** The factory family's name (shown on the default option). */
	defaultFamily: string;
	/** Families to offer; undefined while they load. */
	families: readonly string[] | undefined;
	/** The stored override; null = the default. */
	value: string | null;
	onChange: (family: string | null) => void;
	size?: SelectorSize;
	width?: number | string;
	testid?: string;
	/** Where the list came from (installed vs common fonts). */
	description?: string;
	/** Fires on trigger click (font enumeration needs a user gesture). */
	onOpen?: () => void;
}) {
	const list = families ?? [];
	// A stored custom family that isn't in the list still shows as selected.
	const all = value !== null && !list.includes(value) ? [value, ...list] : list;
	return (
		<Selector
			label={label}
			isLabelHidden
			size={size}
			width={width}
			hasSearch
			searchPlaceholder="Search fonts…"
			isLoading={families === undefined}
			emptySearchText="No fonts match."
			data-testid={testid}
			onClick={onOpen}
			value={value ?? DEFAULT_FONT}
			onChange={(next) => next && onChange(next === DEFAULT_FONT ? null : next)}
			options={[
				{ value: DEFAULT_FONT, label: defaultFamily, description: "Default" },
				...(all.length
					? [{ type: "section" as const, title: description ?? "Fonts", options: all.map((f) => ({ value: f, label: f })) }]
					: []),
			]}
		/>
	);
}
