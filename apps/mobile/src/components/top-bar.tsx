import { Menu } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDrawer } from "@/components/drawer";
import { colors, fonts, spacing, text } from "@/theme";

/** Astryx Top Nav, phone-sized: drawer button, title, trailing slot. */
export function TopBar({ title, right }: { title?: string; right?: ReactNode }) {
	const insets = useSafeAreaInsets();
	const { open } = useDrawer();
	return (
		<View style={[styles.bar, { paddingTop: insets.top + spacing[1] }]}>
			<Pressable accessibilityLabel="Open menu" onPress={open} hitSlop={10} style={styles.icon}>
				<Menu size={22} color={colors.foreground} />
			</Pressable>
			<Text numberOfLines={1} style={styles.title}>
				{title ?? ""}
			</Text>
			<View style={styles.right}>{right}</View>
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing[3],
		paddingHorizontal: spacing[3],
		paddingBottom: spacing[2],
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
		backgroundColor: colors.background,
	},
	icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
	title: { flex: 1, color: colors.foreground, fontFamily: fonts.semibold, fontSize: text.lg },
	right: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
});
