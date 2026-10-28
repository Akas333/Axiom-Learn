/**
 * Astryx primitives, native. Names and props follow the Astryx specs
 * (`npx astryx component Button Card Banner Badge Collapsible SelectableCard Spinner`);
 * values come from the neutral theme tokens in theme.ts.
 */
import { ChevronDown, ChevronRight, CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { colors, fonts, radius, shadows, spacing, text } from "@/theme";

type Elevation = "none" | "low" | "med" | "high";
const elevationStyle = (e: Elevation | undefined) => (e === "low" ? shadows.low : e === "med" ? shadows.med : e === "high" ? shadows.high : null);

// ── Button ──────────────────────────────────────────────────────────────────

export function Button({
	label,
	onClick,
	variant = "secondary",
	size = "md",
	isDisabled,
	isLoading,
	icon,
	iconAfter,
	style,
}: {
	label: string;
	onClick: () => void;
	variant?: "primary" | "secondary" | "ghost" | "destructive";
	size?: "sm" | "md" | "lg";
	isDisabled?: boolean;
	isLoading?: boolean;
	icon?: ReactNode;
	iconAfter?: ReactNode;
	style?: StyleProp<ViewStyle>;
}) {
	const height = size === "sm" ? 32 : size === "lg" ? 48 : 40;
	const fg = variant === "primary" || variant === "destructive" ? colors.primaryForeground : colors.foreground;
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onClick}
			disabled={isDisabled || isLoading}
			style={({ pressed }) => [
				ui.button,
				{ height, paddingHorizontal: size === "sm" ? spacing[3] : spacing[4] },
				variant === "primary" && { backgroundColor: colors.primary },
				variant === "secondary" && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.input },
				variant === "destructive" && { backgroundColor: colors.destructive },
				(isDisabled || isLoading) && { opacity: 0.45 },
				pressed && { opacity: 0.8 },
				style,
			]}
		>
			{isLoading ? <ActivityIndicator color={fg} size="small" /> : icon}
			<Text style={[ui.buttonLabel, { color: fg, fontSize: size === "sm" ? text.sm : text.base }]}>{label}</Text>
			{iconAfter}
		</Pressable>
	);
}

// ── Card / SelectableCard ───────────────────────────────────────────────────

export function Card({
	children,
	padding = 4,
	variant = "default",
	elevation = "none",
	style,
}: {
	children: ReactNode;
	padding?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
	variant?: "default" | "muted" | "transparent" | "green";
	elevation?: Elevation;
	style?: StyleProp<ViewStyle>;
}) {
	const bg = variant === "muted" ? colors.surface : variant === "transparent" ? "transparent" : variant === "green" ? colors.successSoft : colors.card;
	return (
		<View style={[ui.card, { padding: padding * 4, backgroundColor: bg }, variant === "transparent" && { borderWidth: 0 }, elevationStyle(elevation), style]}>
			{children}
		</View>
	);
}

export function SelectableCard({
	label,
	isSelected,
	onChange,
	isDisabled,
	children,
}: {
	label: string;
	isSelected: boolean;
	onChange: (selected: boolean) => void;
	isDisabled?: boolean;
	children: ReactNode;
}) {
	return (
		<Pressable
			accessibilityRole="checkbox"
			accessibilityLabel={label}
			accessibilityState={{ checked: isSelected, disabled: isDisabled }}
			disabled={isDisabled}
			onPress={() => onChange(!isSelected)}
			style={({ pressed }) => [
				ui.selectable,
				isSelected && { borderColor: colors.primary, backgroundColor: colors.selected },
				pressed && { opacity: 0.85 },
				isDisabled && { opacity: 0.5 },
			]}
		>
			{children}
		</Pressable>
	);
}

// ── Banner ──────────────────────────────────────────────────────────────────

export function Banner({
	status,
	title,
	description,
	isDismissable,
	onDismiss,
}: {
	status: "info" | "warning" | "error" | "success";
	title: ReactNode;
	description?: ReactNode;
	isDismissable?: boolean;
	onDismiss?: () => void;
}) {
	const tone = {
		info: { fg: colors.primary, bg: colors.selected, Icon: Info },
		warning: { fg: colors.warning, bg: colors.warningMuted, Icon: TriangleAlert },
		error: { fg: colors.destructive, bg: colors.destructiveMuted, Icon: CircleAlert },
		success: { fg: colors.success, bg: colors.successSoft, Icon: CircleCheck },
	}[status];
	return (
		<View style={[ui.banner, { backgroundColor: tone.bg, borderColor: tone.fg }]}>
			<tone.Icon size={16} color={tone.fg} style={{ marginTop: 2 }} />
			<View style={{ flex: 1, gap: 2 }}>
				{typeof title === "string" ? <Text style={ui.bannerTitle}>{title}</Text> : title}
				{description ? (typeof description === "string" ? <Text style={ui.bannerDesc}>{description}</Text> : description) : null}
			</View>
			{isDismissable ? (
				<Pressable accessibilityLabel="Dismiss" onPress={onDismiss} hitSlop={8}>
					<X size={16} color={colors.mutedForeground} />
				</Pressable>
			) : null}
		</View>
	);
}

// ── Badge ───────────────────────────────────────────────────────────────────

export function Badge({ label, variant = "neutral" }: { label: ReactNode; variant?: "neutral" | "info" | "success" | "warning" | "error" }) {
	const fg = { neutral: colors.mutedForeground, info: colors.primary, success: colors.success, warning: colors.warning, error: colors.destructive }[variant];
	const bg = { neutral: colors.pill, info: colors.selected, success: colors.successSoft, warning: colors.warningMuted, error: colors.destructiveMuted }[variant];
	return (
		<View style={[ui.badge, { backgroundColor: bg }]}>
			<Text numberOfLines={1} style={[ui.badgeLabel, { color: fg }]}>
				{label}
			</Text>
		</View>
	);
}

// ── Collapsible ─────────────────────────────────────────────────────────────

export function Collapsible({
	trigger,
	children,
	isOpen: controlled,
	defaultOpen = false,
	onOpenChange,
}: {
	trigger: ReactNode;
	children: ReactNode;
	isOpen?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	const [own, setOwn] = useState(defaultOpen);
	const open = controlled ?? own;
	return (
		<View>
			<Pressable
				accessibilityRole="button"
				accessibilityState={{ expanded: open }}
				onPress={() => {
					setOwn(!open);
					onOpenChange?.(!open);
				}}
				style={ui.collapsibleTrigger}
			>
				{typeof trigger === "string" ? <Text style={ui.collapsibleLabel}>{trigger}</Text> : trigger}
				{open ? <ChevronDown size={14} color={colors.mutedForeground} /> : <ChevronRight size={14} color={colors.mutedForeground} />}
			</Pressable>
			{open ? <View style={{ paddingTop: spacing[2] }}>{children}</View> : null}
		</View>
	);
}

// ── Spinner / status lines ──────────────────────────────────────────────────

export function Spinner({ size = "md", label }: { size?: "sm" | "md" | "lg" | "xl"; label?: ReactNode }) {
	return (
		<View style={{ alignItems: "center", gap: spacing[2] }}>
			<ActivityIndicator color={colors.mutedForeground} size={size === "lg" || size === "xl" ? "large" : "small"} />
			{label ? <Text style={ui.spinnerLabel}>{label}</Text> : null}
		</View>
	);
}

const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** The tutor's working line (braille spinner + caps label, as on the web: "THINKING…"). */
export function BusyLine({ label }: { label: string }) {
	const [i, setI] = useState(0);
	useEffect(() => {
		const t = setInterval(() => setI((n) => (n + 1) % BRAILLE.length), 80);
		return () => clearInterval(t);
	}, []);
	return (
		<View style={ui.busy}>
			<Text style={ui.busySpin}>{BRAILLE[i]}</Text>
			<Text style={ui.busyLabel}>{label.toUpperCase()}</Text>
		</View>
	);
}

/** A centered divider with a label (phase changes, "Next problem"). */
export function LabelRule({ label }: { label: string }) {
	return (
		<View style={ui.rule}>
			<View style={ui.ruleLine} />
			<Text style={ui.ruleLabel}>{label.toUpperCase()}</Text>
			<View style={ui.ruleLine} />
		</View>
	);
}

// ── Segmented control (Astryx Toggle Button group) ──────────────────────────

export function Segmented<T extends string>({
	value,
	options,
	onChange,
	small,
}: {
	value: T;
	options: { value: T; label: string; icon?: ReactNode }[];
	onChange: (v: T) => void;
	small?: boolean;
}) {
	return (
		<View style={[ui.segment, small && { alignSelf: "flex-start" }]}>
			{options.map((o) => {
				const active = o.value === value;
				return (
					<Pressable
						key={o.value}
						accessibilityRole="button"
						accessibilityState={{ selected: active }}
						onPress={() => onChange(o.value)}
						style={[ui.segmentItem, small && ui.segmentSmall, active && ui.segmentActive]}
					>
						{o.icon}
						<Text style={[ui.segmentLabel, small && { fontSize: text.xs }, active && { color: colors.foreground }]}>{o.label}</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

/** The product mark: two linked discs. */
export function Mark({ size = 18 }: { size?: number }) {
	return (
		<Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
			<Circle cx={8} cy={16} r={5} fill={colors.foreground} />
			<Circle cx={16.5} cy={7.5} r={4.5} stroke={colors.foreground} strokeWidth={1.6} />
			<Path d="M11 13 L13.5 10.5" stroke={colors.foreground} strokeWidth={1.6} strokeLinecap="round" />
		</Svg>
	);
}

/** The tutor's avatar disc (ChatMessage avatar slot). */
export function TutorAvatar() {
	return (
		<View style={ui.avatar}>
			<Mark size={15} />
		</View>
	);
}

export const ui = StyleSheet.create({
	button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.md },
	buttonLabel: { fontFamily: fonts.medium },
	card: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
	selectable: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing[3],
		borderRadius: radius.md,
		borderWidth: 1,
		borderColor: colors.border,
		backgroundColor: colors.surface,
		paddingHorizontal: spacing[3],
		paddingVertical: spacing[3],
	},
	banner: { flexDirection: "row", gap: spacing[2], padding: spacing[3], borderRadius: radius.md, borderWidth: 1 },
	bannerTitle: { color: colors.foreground, fontFamily: fonts.medium, fontSize: text.sm },
	bannerDesc: { color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: text.sm },
	badge: { borderRadius: radius.pill, paddingHorizontal: spacing[2], paddingVertical: 2, alignSelf: "flex-start" },
	badgeLabel: { fontFamily: fonts.medium, fontSize: text.xs },
	collapsibleTrigger: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
	collapsibleLabel: { color: colors.mutedForeground, fontFamily: fonts.medium, fontSize: text.xs, letterSpacing: 0.5 },
	spinnerLabel: { color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: text.sm },
	busy: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
	busySpin: { color: colors.mutedForeground, fontSize: text.sm, fontFamily: fonts.mono },
	busyLabel: { color: colors.mutedForeground, fontSize: text.xs, fontFamily: fonts.medium, letterSpacing: 0.6 },
	rule: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: spacing[3] },
	ruleLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
	ruleLabel: { color: colors.mutedForeground, fontFamily: fonts.medium, fontSize: text.xs, letterSpacing: 0.6 },
	segment: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, padding: 3 },
	segmentItem: { flex: 1, flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center", paddingVertical: 7, borderRadius: radius.pill },
	segmentSmall: { flex: 0, paddingHorizontal: 12, paddingVertical: 5 },
	segmentActive: { backgroundColor: colors.popover },
	segmentLabel: { color: colors.mutedForeground, fontFamily: fonts.medium, fontSize: text.sm },
	avatar: {
		width: 28,
		height: 28,
		borderRadius: radius.pill,
		borderWidth: 1,
		borderColor: colors.input,
		backgroundColor: colors.card,
		alignItems: "center",
		justifyContent: "center",
	},
});
