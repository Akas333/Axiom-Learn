/**
 * Appearance: the settings record's appearance section, applied to the app.
 *
 * Colors and components come from Astryx (neutral theme). The provider
 * wraps the app in Astryx's <Theme> and drives its light/dark `mode` from
 * the record. Reading-type knobs (font, size, heading weight, emphasis
 * inks) stay app CSS variables set on <html>.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { FACTORY_SETTINGS, type AppearanceSettings } from "@/src/core";
import { Theme } from "@astryxdesign/core/theme";
import { themes, defaultThemeSlug } from "@/astryx-themes";

/** Last-applied appearance, read by the inline boot script in index.html
 *  so a reload paints the chosen theme before React mounts (no flash). */
const BOOT_CACHE_KEY = "lh:appearance-boot";

/** The resolved, fully-concrete appearance view (delta + factory merged). */
export function resolveAppearance(delta: AppearanceSettings | undefined) {
	const f = FACTORY_SETTINGS.appearance;
	return {
		mode: delta?.mode ?? f.mode,
		theme: delta?.theme ?? f.theme,
		background: delta?.background ?? f.background,
		fontFamily: delta?.fontFamily ?? f.fontFamily,
		proseFontSize: delta?.proseFontSize ?? f.proseFontSize,
		sessionNameSerif: delta?.sessionNameSerif ?? f.sessionNameSerif,
		mdRendering: {
			headingWeight: delta?.mdRendering?.headingWeight ?? f.mdRendering.headingWeight,
			boldColor: delta?.mdRendering?.boldColor ?? f.mdRendering.boldColor,
			italicColor: delta?.mdRendering?.italicColor ?? f.mdRendering.italicColor,
		},
	};
}

/** THE mapping: resolved appearance → the CSS variables to set on <html>.
 *  Colors are not here: they come from the Astryx neutral theme, switched
 *  by `mode` through <Theme>. These are the reading-type knobs only.
 *  Pure — exported for tests. */
export function appearanceVars(a: ReturnType<typeof resolveAppearance>): Record<string, string> {
	const vars: Record<string, string> = {};
	if (a.fontFamily !== null) {
		vars["--font-prose"] = `"${a.fontFamily}", var(--font-family-body)`;
	}
	// The one reading-size variable: prose, inputs, and session titles read it.
	vars["--lh-prose-size"] = `${a.proseFontSize}px`;
	// Session names: serif by default; the toggle swaps to the prose family.
	if (!a.sessionNameSerif) vars["--font-title"] = "var(--font-prose)";
	vars["--lh-heading-weight"] = String(a.mdRendering.headingWeight);
	if (a.mdRendering.boldColor !== null) vars["--lh-ink-strong"] = a.mdRendering.boldColor;
	if (a.mdRendering.italicColor !== null) vars["--lh-ink-italic"] = a.mdRendering.italicColor;
	return vars;
}

/** Pure: the previously-applied names ABSENT from the next var set —
 *  these get removeProperty so the factory stylesheet value returns.
 *  (Owner repro, fix wave: resets and toggle-backs never reverted because
 *  application only ever SET properties — the removal half was missing.)
 *  Exported for tests. */
export function staleVarNames(
	prevNames: readonly string[],
	nextVars: Record<string, string>,
): string[] {
	return prevNames.filter((n) => !(n in nextVars));
}

function bootVarNames(): string[] {
	try {
		const cached = JSON.parse(localStorage.getItem(BOOT_CACHE_KEY) ?? "null") as { vars?: Record<string, string> } | null;
		return Object.keys(cached?.vars ?? {});
	} catch {
		return [];
	}
}

/** The browser chrome color follows the Astryx body color. */
function syncThemeColor() {
	const bg = getComputedStyle(document.documentElement).getPropertyValue("--color-background-body").trim();
	if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
}

interface AppearanceContextValue {
	/** Resolved appearance; factory until the record arrives. */
	appearance: ReturnType<typeof resolveAppearance>;
	/** Called by the settings page after a successful section PUT. */
	onAppearanceChange: (delta: AppearanceSettings | undefined) => void;
}

const AppearanceContext = createContext<AppearanceContextValue>({
	appearance: resolveAppearance(undefined),
	onAppearanceChange: () => {},
});

export function useAppearance() {
	return useContext(AppearanceContext);
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
	const [delta, setDelta] = useState<AppearanceSettings | undefined>(undefined);
	const appliedRef = useRef<string>("");

	// The vars apply on every change — stringified as the change signal.
	const vars = useMemo(() => appearanceVars(resolveAppearance(delta)), [delta]);
	const key = useMemo(() => JSON.stringify(vars), [vars]);
	// REMOVAL is half the job (owner repro, fix wave): a later write that
	// OMITS a var (empty field = factory, serif toggle back on) must clear
	// the previously-set inline value or the stale one wins forever —
	// backgrounds never reset, toggles looked dead. Every name this effect
	// has ever set is tracked; names absent from the new set are removed so
	// the factory stylesheet value returns.
	// Seeded with what the boot script already set, so those clear too.
	const appliedNamesRef = useRef<Set<string>>(new Set(bootVarNames()));
	// Hold the factory pass until the record arrives: applying it first
	// would undo the boot script's theme for a moment (a flash).
	const [loaded, setLoaded] = useState(false);
	useEffect(() => {
		if (!loaded) return;
		if (appliedRef.current === key) return;
		appliedRef.current = key;
		const root = document.documentElement;
		for (const name of staleVarNames([...appliedNamesRef.current], vars)) {
			root.style.removeProperty(name);
			appliedNamesRef.current.delete(name);
		}
		for (const [name, value] of Object.entries(vars)) {
			root.style.setProperty(name, value);
			appliedNamesRef.current.add(name);
		}
		requestAnimationFrame(syncThemeColor);
		try {
			localStorage.setItem(BOOT_CACHE_KEY, JSON.stringify({ vars, mode: resolveAppearance(delta).mode }));
		} catch {}
	}, [key, vars, delta, loaded]);

	// One fetch per app load: the record (sanitized server-side) carries the
	// delta; resolution happens here against the compiled factory.
	useEffect(() => {
		let alive = true;
		fetch("/api/settings")
			.then((r) => r.json())
			.then((body: { settings?: Record<string, unknown> }) => {
				if (!alive) return;
				// The record arrives sanitized server-side; the appearance
				// slice is unknown-shaped here, so it goes through the same
				// resolve (absent/invalid fields = factory anyway).
				const appearance = body.settings?.appearance;
				setDelta(
					appearance && typeof appearance === "object" ? (appearance as AppearanceSettings) : undefined,
				);
				setLoaded(true);
			})
			.catch(() => setLoaded(true)); // settings stay factory — not worth a crash
		return () => {
			alive = false;
		};
	}, []);

	const onAppearanceChange = useCallback((next: AppearanceSettings | undefined) => {
		setDelta(next);
		setLoaded(true);
	}, []);

	const value = useMemo(
		() => ({ appearance: resolveAppearance(delta), onAppearanceChange }),
		[delta, onAppearanceChange],
	);
	// The Astryx neutral theme for the whole app. The root Theme writes
	// data-theme on <html>, so portaled overlays get the same tokens.
	return (
		<AppearanceContext.Provider value={value}>
			<Theme theme={themes[defaultThemeSlug]} mode={value.appearance.mode}>
				{children}
			</Theme>
		</AppearanceContext.Provider>
	);
}