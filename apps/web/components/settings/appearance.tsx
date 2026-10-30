/**
 * THE APPEARANCE APPLICATION (thin settings wave, 2026-09-19): the settings
 * record's appearance section actually DOES something — resolved against
 * the factory defaults and applied as RUNTIME CSS variables on <html>.
 *
 * Why variables and not className swaps: every seam the settings touch was
 * built token-first (--font-prose, --lh-prose-size, --lh-ink-strong, …),
 * so application is setProperty and nothing re-renders. The ONE thing the
 * variables can't reach — the mode — is dark-only this wave (the light
 * palette is designed in the later design wave; <html class="dark"> is
 * static in app/layout.tsx).
 *
 * The provider is mounted at the ROOT LAYOUT level (like ActivityProvider):
 * every page picks appearance up on load. The settings page writes a
 * section, hands the new appearance here, and the vars move immediately.
 *
 * (The open-settings keyboard chord lives in components/keyboard-shortcuts.tsx
 * with the other navigations — mod+, pushes /settings from anywhere.)
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { FACTORY_SETTINGS, type AppearanceSettings } from "@/src/core";
import { themeById, themeVars } from "./themes.ts";

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

/** One channel clamped on the dark curve: additive offsets matching today's
 *  hand-picked palette (#141414 → card #1c1c1c (+8) → accent #2a2a2a (+22)
 *  → border #434343 (+47)) — the "per-mode derivation in code" the schema
 *  promises, as the thinnest curve that keeps the palette's relationships. */
function raise(hex: string, add: number): string {
	const n = hex.length === 4
		? hex.slice(1).split("").map((c) => parseInt(c + c, 16))
		: [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
	return `#${n.map((c) => Math.max(0, Math.min(255, c + add)).toString(16).padStart(2, "0")).join("")}`;
}

/** The derived palette a chosen background implies (dark curve): background
 *  itself, the raised surfaces (card/popover/secondary/muted, +8), the
 *  accent (+22), the edges (border/input, +47), and primary-foreground
 *  (the inverted text on primary = the background's own color, as today). */
export function derivedPalette(background: string, mode: "dark" | "light" = "dark"): Record<string, string> {
	// Light themes step surfaces DARKER than the background, dark ones lighter.
	const dir = mode === "light" ? -1 : 1;
	const card = raise(background, 8 * dir);
	const accent = raise(background, 22 * dir);
	const border = raise(background, 47 * dir);
	return {
		"--background": background,
		"--card": card,
		"--popover": card,
		"--secondary": card,
		"--muted": card,
		"--accent": accent,
		"--border": border,
		"--input": border,
		"--primary-foreground": background,
	};
}

/** THE mapping: resolved appearance → the CSS variables to set on <html>.
 *  Absent entries = leave the factory stylesheet value in place. Pure —
 *  exported for tests. */
export function appearanceVars(a: ReturnType<typeof resolveAppearance>): Record<string, string> {
	const theme = themeById(a.theme);
	const vars: Record<string, string> = { ...themeVars(theme) };
	if (a.background !== null) {
		const derived = derivedPalette(a.background, theme.mode);
		// A theme brings its own text-on-primary color; keep it.
		if (theme.id !== "kapany-dark") delete derived["--primary-foreground"];
		Object.assign(vars, derived);
	}
	if (a.fontFamily !== null) {
		vars["--font-prose"] = `"${a.fontFamily}", var(--font-sans3), ui-sans-serif, system-ui, sans-serif`;
	}
	// The ONE documented reading-size variable (typography round 4): prose,
	// inputs, and session titles all read it, so one setProperty moves them.
	vars["--lh-prose-size"] = `${a.proseFontSize}px`;
	// Session names: CMU Serif by default; the toggle swaps the title font
	// to the prose family — covers chat.tsx + new-session.tsx titles with
	// zero component edits (they use the .font-title utility).
	if (!a.sessionNameSerif) vars["--font-title"] = "var(--font-prose)";
	// Markdown rendering: heading weight + the emphasis inks (the vars
	// were built "ready for the settings UI").
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

/** Dark/light switch on <html>: the class, the native color scheme
 *  (scrollbars, form controls) and the browser's theme color. */
function applyMode(dark: boolean) {
	const root = document.documentElement;
	root.classList.toggle("dark", dark);
	root.style.colorScheme = dark ? "dark" : "light";
	const bg = getComputedStyle(root).getPropertyValue("--background").trim();
	document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg || (dark ? "#141414" : "#ffffff"));
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
		// Light themes switch Tailwind's dark: variants off too.
		const dark = themeById(resolveAppearance(delta).theme).mode === "dark";
		applyMode(dark);
		try {
			localStorage.setItem(BOOT_CACHE_KEY, JSON.stringify({ vars, dark }));
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
	return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}