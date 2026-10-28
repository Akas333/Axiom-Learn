/**
 * The Appearance + Graph sections (thin settings wave).
 *
 * Appearance controls resolve against the factory in the provider; writes
 * PUT the whole appearance section and hand the delta back so changes
 * apply immediately. Colors come from the Astryx neutral theme; the only
 * color choice is light or dark mode.
 *
 * Graph graying (owner, 2026-09-20) follows the graph viewer's render-panel
 * convention: the whole row dims when a parent is off (stored values
 * persist but resolve inert — the switch shows stored, the dim effective).
 *
 * Reading font (appearance wave, 2026-09-26, owner ruling): a searchable
 * dropdown of the user's INSTALLED fonts (FontMenuList over model-menu's
 * machine) fed by window.queryLocalFonts() in the desktop shell — the
 * enumeration is click-bound (the API requires user activation), deduped
 * to unique families, the factory family excluded (the DEFAULT row is
 * it). In a plain dev browser the API is absent → a small curated list
 * + a footer that says exactly that — never a fabricated system list.
 * The custom-family input inside the menu is the manual escape path.
 * Empty/unset keeps meaning Source Sans 3.
 *
 * Emphasis inks (same wave): the factory tokens default to the regular
 * text color now (globals.css); the rows' empty-state labels say "same
 * as text".
 */

import { themes, type ThemeSlug } from "@/astryx-themes";
import { VStack } from "@astryxdesign/core/VStack";
import { Token } from "@astryxdesign/core/Token";
import { Theme } from "@astryxdesign/core/theme";
import { Text } from "@astryxdesign/core/Text";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { useState } from "react";
import {
	EXTRACTION_CHUNK_TOKENS_FLOOR,
	resolveSettings,
	type AppearanceSettings,
	type GraphSettings,
} from "@/src/core";
import { themeSlug, useAppearance } from "./appearance.tsx";
import { FontSelector } from "./model-menu";
import { CommitInput, SettingsRow, Toggle } from "./controls.tsx";

/** Every Astryx theme, in the order the Astryx site lists them. */
const THEME_CHOICES: readonly { slug: ThemeSlug; name: string; description: string }[] = [
	{ slug: "neutral", name: "Neutral", description: "Muted and minimal, with Figtree type." },
	{ slug: "stone", name: "Stone", description: "Warm stone and slate tones." },
	{ slug: "gothic", name: "Gothic", description: "Deep blue-grays and a display serif. Dark only." },
	{ slug: "matcha", name: "Matcha", description: "Earthy greens with a calm, organic feel." },
	{ slug: "y2k", name: "Y2K", description: "Playful pop: periwinkle body, holographic accents." },
	{ slug: "butter", name: "Butter", description: "Golden, buttery surfaces with blue accents." },
	{ slug: "chocolate", name: "Chocolate", description: "Rich browns and cozy beige." },
];

/** The factory reading family — the DEFAULT row's identity (unset =
 *  this). Exported for tests. */
export const DEFAULT_READING_FONT = "Source Sans 3";

/** The dev-browser fallback list (queryLocalFonts is absent there):
 *  the app's own knowns plus a handful of ubiquitous macOS families,
 *  honestly LABELED as common — never presented as the system's real
 *  list. The factory family is absent: the DEFAULT row is it. Exported
 *  for tests. */
export const CURATED_FALLBACK_FONTS: readonly string[] = [
	"Arial",
	"CMU Serif",
	"Courier New",
	"Georgia",
	"Helvetica",
	"Helvetica Neue",
	"Menlo",
	"Times New Roman",
	"Trebuchet MS",
	"Verdana",
];

/** window.queryLocalFonts' shape as this section consumes it (family is
 *  the only field used; the API returns one FontData per FACE — the
 *  caller dedupes). */
type LocalFontsApi = () => Promise<Array<{ family: string }>>;

/** The Local Font Access seam — read lazily (SSR has no window, and
 *  render-time access would evaluate the API on the server). */
function localFontsApi(): LocalFontsApi | null {
	if (typeof window === "undefined") return null;
	return (window as unknown as { queryLocalFonts?: LocalFontsApi }).queryLocalFonts ?? null;
}

/** Compose the reading-font pick: null (or blank) = the factory
 *  Source Sans 3; otherwise the family verbatim (trimmed — the
 *  sanitizer trims again server-side). Pure — exported for tests. */
export function composeFontFamily(
	appearance: AppearanceSettings | undefined,
	family: string | null,
): AppearanceSettings {
	const value = family?.trim() ?? "";
	return { ...appearance, fontFamily: value === "" ? null : value };
}

export function AppearanceSection({
	appearance,
	onSectionChange,
}: {
	/** The record's appearance delta (absent = factory). */
	appearance: AppearanceSettings | undefined;
	/** PUT the whole appearance section; the page re-applies on success. */
	onSectionChange: (next: AppearanceSettings) => void;
}) {
	const { appearance: resolved } = useAppearance();
	const md = appearance?.mdRendering;

	// The font dropdown's open state + its enumeration cache. undefined =
	// not enumerated yet (desktop: click-bound queryLocalFonts pending);
	// null = enumeration UNAVAILABLE (the API is absent in a plain
	// browser, rejected, or resolved EMPTY — Electron 44's local-fonts
	// grant passes and the enumeration still yields zero fonts,
	// reproduced 2026-09-26) → the curated fallback; a list = the deduped
	// families. enumEmpty distinguishes WHY it fell back, for the footer.
	const [localFonts, setLocalFonts] = useState<string[] | null | undefined>(undefined);
	const [enumEmpty, setEnumEmpty] = useState(false);

	// queryLocalFonts needs a user gesture, so the enumeration runs on the
	// picker's first click. Unavailable (absent, rejected or empty) falls
	// back to the curated list.
	const enumerateFonts = () => {
		if (localFonts !== undefined) return;
		const api = localFontsApi();
		if (api === null) {
			setLocalFonts(null);
			return;
		}
		void api()
			.then((fonts) => {
				const families = [...new Set(fonts.map((f) => f.family))]
					.filter((f) => f !== DEFAULT_READING_FONT)
					.sort((a, b) => a.localeCompare(b));
				if (families.length === 0) {
					setLocalFonts(null);
					setEnumEmpty(true);
				} else setLocalFonts(families);
			})
			.catch(() => setLocalFonts(null));
	};

	return (
		<>
			<VStack gap={3} paddingBlock={4} data-testid="row-theme" className="border-b border-border">
				<VStack gap={1}>
					<Text type="body">Theme</Text>
					<Text type="supporting">Astryx themes — colors, type and shape for the whole app.</Text>
				</VStack>
				<div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{THEME_CHOICES.map((t) => (
						<SelectableCard
							key={t.slug}
							label={t.name}
							padding={0}
							data-testid={`theme-${t.slug}`}
							isSelected={themeSlug(appearance?.theme) === t.slug}
							onChange={() => onSectionChange({ ...appearance, theme: t.slug === "neutral" ? null : t.slug })}
						>
							{/* A live sample: the theme itself, in the current mode. */}
							<Theme theme={themes[t.slug]} mode={t.slug === "gothic" ? "dark" : resolved.mode}>
								<VStack gap={2} padding={3} className="h-full rounded-[inherit] bg-body">
									<HStack gap={2} align="center" justify="between">
										<Heading level={5}>{t.name}</Heading>
										<Token size="sm" label="Aa" color="blue" />
									</HStack>
									<Text type="supporting" maxLines={2}>{t.description}</Text>
									<ProgressBar label={`${t.name} accent`} isLabelHidden value={62} />
								</VStack>
							</Theme>
						</SelectableCard>
					))}
				</div>
			</VStack>
			<SettingsRow label="Mode" hint="Light or dark. Gothic is always dark." testid="row-mode">
				<SegmentedControl
					label="Color mode"
					size="sm"
					value={resolved.mode}
					onChange={(mode) => onSectionChange({ ...appearance, mode: mode === "light" ? "light" : "dark" })}
				>
					<SegmentedControlItem value="dark" label="Dark" />
					<SegmentedControlItem value="light" label="Light" />
				</SegmentedControl>
			</SettingsRow>
			<SettingsRow
				label="Reading font"
				hint={`Empty = ${DEFAULT_READING_FONT}`}
				testid="row-font"
			>
				<FontSelector
					label="Reading font"
					testid="font-trigger"
					defaultFamily={DEFAULT_READING_FONT}
					width={208}
					families={localFonts === undefined ? [...CURATED_FALLBACK_FONTS] : (localFonts ?? [...CURATED_FALLBACK_FONTS])}
					description={
						localFonts
							? "Your installed fonts"
							: enumEmpty
								? "Common fonts — installed fonts could not be read"
								: "Common fonts"
					}
					value={appearance?.fontFamily ?? null}
					onOpen={enumerateFonts}
					onChange={(family) => onSectionChange(composeFontFamily(appearance, family))}
				/>
			</SettingsRow>
			<SettingsRow label="Reading font size" hint={`${resolved.proseFontSize}px`} testid="row-prose-size">
				<CommitInput
					type="number"
					value={String(appearance?.proseFontSize ?? "")}
					placeholder="16"
					ariaLabel="prose font size"
					testid="input-prose-size"
					onCommit={(v) => {
						// Empty = factory default (owner, fix wave): omit the key so the record
						// UNSETS and the field stays empty (absence, not null, is the
						// unset for numbers). Number("") is 0, so the old clamp wrote 12.
						if (v === "") {
							onSectionChange({ ...appearance, proseFontSize: undefined });
							return;
						}
						const n = Number(v);
						if (!Number.isFinite(n)) return; // bad input: no write, factory stays
						onSectionChange({ ...appearance, proseFontSize: Math.min(24, Math.max(12, Math.round(n))) });
					}}
				/>
			</SettingsRow>
			<SettingsRow label="Session names in serif" testid="row-session-serif">
				<Toggle
					checked={appearance?.sessionNameSerif ?? true}
					label="session names serif"
					onChange={(on) => onSectionChange({ ...appearance, sessionNameSerif: on })}
				/>
			</SettingsRow>
			<SettingsRow label="Heading weight" hint={`${resolved.mdRendering.headingWeight}`} testid="row-heading-weight">
				<CommitInput
					type="number"
					value={String(md?.headingWeight ?? "")}
					placeholder="900"
					ariaLabel="heading weight"
					testid="input-heading-weight"
					onCommit={(v) => {
						// Empty = factory default (owner, fix wave): Number("") is 0, so
						// Absence is the unset representation — the old clamp wrote 100.
						if (v === "") {
							onSectionChange({ ...appearance, mdRendering: { ...md, headingWeight: undefined } });
							return;
						}
						const n = Number(v);
						if (!Number.isFinite(n)) return;
						onSectionChange({
							...appearance,
							mdRendering: { ...md, headingWeight: Math.min(900, Math.max(100, Math.round(n))) },
						});
					}}
				/>
			</SettingsRow>
			{/* The emphasis inks default to the REGULAR TEXT COLOR now
			    (appearance wave, 2026-09-26) — the empty-state labels say
			    so; explicit hex overrides ride unchanged. */}
			<SettingsRow label="Bold color" hint="Empty = same as text" testid="row-bold-color">
				<CommitInput
					value={md?.boldColor ?? ""}
					placeholder="same as text"
					ariaLabel="bold color"
					testid="input-bold-color"
					onCommit={(v) => onSectionChange({ ...appearance, mdRendering: { ...md, boldColor: v === "" ? null : v } })}
				/>
			</SettingsRow>
			<SettingsRow label="Italic color" hint="Empty = same as text" testid="row-italic-color">
				<CommitInput
					value={md?.italicColor ?? ""}
					placeholder="same as text"
					ariaLabel="italic color"
					testid="input-italic-color"
					onCommit={(v) => onSectionChange({ ...appearance, mdRendering: { ...md, italicColor: v === "" ? null : v } })}
				/>
			</SettingsRow>
		</>
	);
}

export function GraphSection({
	graph,
	onSectionChange,
}: {
	graph: GraphSettings | undefined;
	onSectionChange: (next: GraphSettings) => void;
}) {
	// Wave 7 collapse (owner ruling 2026-09-23): the section is the MASTER
	// SWITCH — the embedding/clustering/labeling rungs are gone; clustering
	// is the free birth-session partition derived on read, labels ARE session
	// names. The chunk budget (2026-10-02) joined it as the section's second
	// and only other control: it denominates the coverage ring AND gates the
	// auto-extraction trigger (turn settle ≥ budget fires the run).
	//
	// Resolved through the SAME core resolver the server's effective
	// settings use (one source of truth, the 4096-fallback fix 2026-10-02):
	// the hint and placeholder report exactly the number the trigger waits
	// for — never a second hand-rolled default.
	const resolved = resolveSettings(graph === undefined ? null : { version: 1, graph }).graph;
	return (
		<>
			{/* EXTRACTION (renamed, owner 2026-10-06): this switch is the DATA
			    channel — the pipeline, the auditor, the prober's graph tools. It
			    was born labeled "Graph" and that label lied once the rendering
			    switch below arrived: off ≠ no graph, off = the graph stops
			    growing. The testid keeps the old name's shape (row-enabled) so
			    this stays one rename, not a test re-pin. */}
			<SettingsRow label="Extraction" hint="Off = the graph stops growing" testid="graph-row-enabled">
				<Toggle
					checked={graph?.enabled ?? true}
					label="extraction enabled"
					onChange={(on) =>
						// Compose, never replace-whole (the section PUT is, but the
					// row must not drop its sibling field — fixed with the budget
					// row's arrival: the old { enabled: on } wiped a stored budget).
						onSectionChange({ ...graph, enabled: on })
					}
				/>
			</SettingsRow>
			{/* GRAPH RENDERING (owner, 2026-10-06 — the release graph-controls
			    round): display-only. Off = the home shows the chains view
			    instead of the canvas. The ledgers, the pipeline, everything
			    data keeps working — that is the extraction switch above. */}
			<SettingsRow label="Graph rendering" hint="Off = home shows the chains view" testid="graph-row-rendering">
				<Toggle
					checked={graph?.rendering ?? true}
					label="graph rendering enabled"
					onChange={(on) => onSectionChange({ ...graph, rendering: on })}
				/>
			</SettingsRow>
			<SettingsRow
				label="Extraction chunk budget"
				hint={`${resolved.extractionChunkTokens} tok`}
				testid="graph-row-chunk-tokens"
			>
				<CommitInput
					type="number"
					value={String(graph?.extractionChunkTokens ?? "")}
					placeholder={String(resolved.extractionChunkTokens)}
					ariaLabel="extraction chunk budget"
					testid="input-chunk-tokens"
					onCommit={(v) => {
						// Empty = factory default (the fix-wave discipline): absence is
						// the unset for numbers — Number("") is 0, so clamping would
						// write the floor instead of unsetting.
						if (v === "") {
							onSectionChange({ ...graph, extractionChunkTokens: undefined });
							return;
						}
						const n = Number(v);
						if (!Number.isFinite(n) || n <= 0) return; // bad input: no write
						// Mirror the server sanitize exactly: floor only (cost
						// protection), no ceiling — a big budget is the user's call.
						onSectionChange({
							...graph,
							extractionChunkTokens: Math.max(EXTRACTION_CHUNK_TOKENS_FLOOR, Math.round(n)),
						});
					}}
				/>
			</SettingsRow>
		</>
	);
}