/**
 * Standard color themes. Each theme is the app's full color-token set
 * (the same names as :root in app/globals.css), applied as inline CSS
 * variables on <html> by the AppearanceProvider. Light themes also drop
 * the `dark` class so Tailwind's dark: variants switch off.
 *
 * "kapany-dark" is the factory look: it sets nothing, so the stylesheet's
 * own values apply.
 */

import type { ThemeId } from "@/src/core";

export interface ThemePalette {
	background: string;
	foreground: string;
	card: string;
	mutedForeground: string;
	accent: string;
	border: string;
	input: string;
	primary: string;
	primaryForeground: string;
	primarySoft: string;
	/** Hover/selected wash for rows and pills. */
	pill: string;
	pillHover: string;
}

export interface Theme {
	id: ThemeId;
	label: string;
	mode: "dark" | "light";
	palette: ThemePalette;
}

export const THEMES: readonly Theme[] = [
	{
		id: "kapany-dark",
		label: "TYSA Dark",
		mode: "dark",
		palette: {
			background: "#111112",
			foreground: "#f2f4f6",
			card: "#1f1f22",
			mutedForeground: "#9fa4ab",
			accent: "#2b2c30",
			border: "#2e3034",
			input: "#3a3c41",
			primary: "#0064e0",
			primaryForeground: "#ffffff",
			primarySoft: "#4ca3ff",
			pill: "rgba(223, 226, 229, 0.2)",
			pillHover: "rgba(223, 226, 229, 0.28)",
		},
	},
	{
		id: "kapany-light",
		label: "TYSA Light",
		mode: "light",
		palette: {
			background: "#ffffff",
			foreground: "#1d1f23",
			card: "#f5f6f8",
			mutedForeground: "#5f6670",
			accent: "#eceef1",
			border: "#e2e5e9",
			input: "#d3d7dc",
			primary: "#0064e0",
			primaryForeground: "#ffffff",
			primarySoft: "#0a58c2",
			pill: "rgba(29, 31, 35, 0.07)",
			pillHover: "rgba(29, 31, 35, 0.11)",
		},
	},
	{
		id: "midnight",
		label: "Midnight",
		mode: "dark",
		palette: {
			background: "#0b1220",
			foreground: "#e6edf7",
			card: "#131c2e",
			mutedForeground: "#8b9ab3",
			accent: "#1b2740",
			border: "#223050",
			input: "#2b3a5c",
			primary: "#3b82f6",
			primaryForeground: "#ffffff",
			primarySoft: "#7cb2ff",
			pill: "rgba(148, 178, 230, 0.16)",
			pillHover: "rgba(148, 178, 230, 0.24)",
		},
	},
	{
		id: "nord",
		label: "Nord",
		mode: "dark",
		palette: {
			background: "#2e3440",
			foreground: "#eceff4",
			card: "#3b4252",
			mutedForeground: "#a3abbd",
			accent: "#434c5e",
			border: "#4c566a",
			input: "#56617a",
			primary: "#5e81ac",
			primaryForeground: "#eceff4",
			primarySoft: "#88c0d0",
			pill: "rgba(216, 222, 233, 0.14)",
			pillHover: "rgba(216, 222, 233, 0.22)",
		},
	},
	{
		id: "dracula",
		label: "Dracula",
		mode: "dark",
		palette: {
			background: "#282a36",
			foreground: "#f8f8f2",
			card: "#323444",
			mutedForeground: "#a2a7c8",
			accent: "#3c3f52",
			border: "#44475a",
			input: "#565970",
			primary: "#9d6ff0",
			primaryForeground: "#ffffff",
			primarySoft: "#d0b3ff",
			pill: "rgba(248, 248, 242, 0.12)",
			pillHover: "rgba(248, 248, 242, 0.19)",
		},
	},
	{
		id: "catppuccin-mocha",
		label: "Catppuccin Mocha",
		mode: "dark",
		palette: {
			background: "#1e1e2e",
			foreground: "#cdd6f4",
			card: "#262637",
			mutedForeground: "#a6adc8",
			accent: "#313244",
			border: "#3a3b52",
			input: "#45475a",
			primary: "#6d8fe0",
			primaryForeground: "#11111b",
			primarySoft: "#89b4fa",
			pill: "rgba(205, 214, 244, 0.12)",
			pillHover: "rgba(205, 214, 244, 0.19)",
		},
	},
	{
		id: "gruvbox-dark",
		label: "Gruvbox Dark",
		mode: "dark",
		palette: {
			background: "#282828",
			foreground: "#ebdbb2",
			card: "#32302f",
			mutedForeground: "#a89984",
			accent: "#3c3836",
			border: "#504945",
			input: "#665c54",
			primary: "#d79921",
			primaryForeground: "#282828",
			primarySoft: "#fabd2f",
			pill: "rgba(235, 219, 178, 0.12)",
			pillHover: "rgba(235, 219, 178, 0.19)",
		},
	},
	{
		id: "solarized-dark",
		label: "Solarized Dark",
		mode: "dark",
		palette: {
			background: "#002b36",
			foreground: "#e3dfcf",
			card: "#073642",
			mutedForeground: "#93a1a1",
			accent: "#0d4553",
			border: "#134b58",
			input: "#1d5664",
			primary: "#268bd2",
			primaryForeground: "#fdf6e3",
			primarySoft: "#5cb3f0",
			pill: "rgba(147, 161, 161, 0.18)",
			pillHover: "rgba(147, 161, 161, 0.26)",
		},
	},
	{
		id: "solarized-light",
		label: "Solarized Light",
		mode: "light",
		palette: {
			background: "#fdf6e3",
			foreground: "#073642",
			card: "#f3ecd6",
			mutedForeground: "#657b83",
			accent: "#eae2c9",
			border: "#ddd6c1",
			input: "#cfc7ae",
			primary: "#268bd2",
			primaryForeground: "#fdf6e3",
			primarySoft: "#1b6ea8",
			pill: "rgba(7, 54, 66, 0.08)",
			pillHover: "rgba(7, 54, 66, 0.13)",
		},
	},
	{
		id: "sepia",
		label: "Sepia",
		mode: "light",
		palette: {
			background: "#f4ecd8",
			foreground: "#3b2f22",
			card: "#ece2ca",
			mutedForeground: "#7a6a55",
			accent: "#e3d7bb",
			border: "#d8caa8",
			input: "#cbbb95",
			primary: "#9c5b1f",
			primaryForeground: "#fffaf0",
			primarySoft: "#8a4e17",
			pill: "rgba(59, 47, 34, 0.08)",
			pillHover: "rgba(59, 47, 34, 0.13)",
		},
	},
];

export const DEFAULT_THEME_ID: ThemeId = "kapany-dark";

export function themeById(id: string | null | undefined): Theme {
	return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

/** A theme's CSS variables. The factory theme sets none (the stylesheet
 *  already carries it). */
export function themeVars(theme: Theme): Record<string, string> {
	if (theme.id === DEFAULT_THEME_ID) return {};
	const p = theme.palette;
	return {
		"--background": p.background,
		"--foreground": p.foreground,
		"--card": p.card,
		"--card-foreground": p.foreground,
		"--popover": p.card,
		"--popover-foreground": p.foreground,
		"--primary": p.primary,
		"--primary-foreground": p.primaryForeground,
		"--secondary": p.card,
		"--secondary-foreground": p.foreground,
		"--muted": p.card,
		"--muted-foreground": p.mutedForeground,
		"--accent": p.accent,
		"--accent-foreground": p.foreground,
		"--border": p.border,
		"--input": p.input,
		"--ring": p.primary,
		"--pill": p.pill,
		"--pill-hover": p.pillHover,
		"--primary-soft": p.primarySoft,
	};
}
