/**
 * Astryx neutral theme (dark), as React Native values. Token values come from
 * @astryxdesign/theme-neutral (the same set apps/mobile/src/theme/tokens.ts
 * extracted). Astryx's web components read these as CSS variables
 * (--color-*, --radius-*, --spacing-*); native components read them here.
 */
export const astryx = {
	accent: "#2694FE",
	accentMuted: "rgba(38, 148, 254, 0.15)",
	onAccent: "#FFFFFF",
	neutral: "rgba(255, 255, 255, 0.08)",
	backgroundBody: "#111112",
	backgroundSurface: "#18191B",
	backgroundCard: "#1F2024",
	backgroundPopover: "#28292D",
	backgroundMuted: "rgba(255, 255, 255, 0.05)",
	border: "#292B30",
	borderEmphasized: "#3A3D45",
	textPrimary: "#EDEDED",
	textSecondary: "#9A9EA7",
	textDisabled: "#5A5E66",
	success: "#12B76A",
	successMuted: "rgba(18, 183, 106, 0.15)",
	warning: "#F79009",
	warningMuted: "rgba(247, 144, 9, 0.15)",
	error: "#F04438",
	errorMuted: "rgba(240, 68, 56, 0.15)",
	bubbleUser: "#0064E0",
} as const;

/** Role names the app's components use, mapped onto the Astryx tokens. */
export const colors = {
	background: astryx.backgroundBody,
	surface: astryx.backgroundSurface,
	card: astryx.backgroundCard,
	popover: astryx.backgroundPopover,
	foreground: astryx.textPrimary,
	mutedForeground: astryx.textSecondary,
	disabled: astryx.textDisabled,
	primary: astryx.accent,
	primarySoft: astryx.accent,
	primaryForeground: astryx.onAccent,
	muted: astryx.backgroundMuted,
	accent: astryx.neutral,
	destructive: astryx.error,
	destructiveMuted: astryx.errorMuted,
	warning: astryx.warning,
	warningMuted: astryx.warningMuted,
	border: astryx.border,
	input: astryx.borderEmphasized,
	pill: astryx.neutral,
	selected: astryx.accentMuted,
	userBubble: astryx.bubbleUser,
	success: astryx.success,
	successSoft: astryx.successMuted,
} as const;

/** --font-family-body / heading is Figtree; code is the platform monospace. */
export const fonts = {
	regular: "Figtree_400Regular",
	medium: "Figtree_500Medium",
	semibold: "Figtree_600SemiBold",
	bold: "Figtree_700Bold",
	mono: "JetBrainsMono_400Regular",
} as const;

/** --radius-* */
export const radius = { sm: 6, md: 10, lg: 14, xl: 20, pill: 9999 } as const;

/** --spacing-* (4px grid) */
export const spacing = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;

/** --font-size-* (sm 12 / base 14 / lg 17) plus prose and titles. */
export const text = { xs: 12, sm: 13, base: 14, lg: 17, xl: 20, prose: 16, title: 28 } as const;

/** --shadow-* elevations. */
export const shadows = {
	low: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 2, elevation: 2 },
	med: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6 },
	high: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 10 },
} as const;

/** Quiz confidence colors, one per stop (0/30/50/70/90/100). */
export const CONFIDENCE_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#10b981"] as const;
