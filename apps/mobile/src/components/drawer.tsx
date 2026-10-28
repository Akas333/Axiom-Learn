import { router, usePathname } from "expo-router";
import { Dumbbell, Plus, Search, Settings } from "lucide-react-native";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
	ActivityIndicator,
	Alert,
	Animated,
	Dimensions,
	FlatList,
	Modal,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ChatListItem } from "@/src/core";
import { Mark, Segmented } from "@/components/ui";
import { timeAgo, useSessions } from "@/lib/sessions";
import { colors, fonts, radius, text } from "@/theme";

const DrawerContext = createContext<{ open: () => void } | null>(null);

export function useDrawer() {
	const ctx = useContext(DrawerContext);
	if (!ctx) throw new Error("useDrawer outside DrawerProvider");
	return ctx;
}

const WIDTH = Math.min(340, Dimensions.get("window").width * 0.86);

export function DrawerProvider({ children }: { children: ReactNode }) {
	const [visible, setVisible] = useState(false);
	const x = useRef(new Animated.Value(-WIDTH)).current;

	useEffect(() => {
		if (visible) Animated.timing(x, { toValue: 0, duration: 200, useNativeDriver: true }).start();
	}, [visible, x]);

	const close = () => {
		Animated.timing(x, { toValue: -WIDTH, duration: 160, useNativeDriver: true }).start(() => setVisible(false));
	};
	const value = useMemo(() => ({ open: () => setVisible(true) }), []);

	return (
		<DrawerContext.Provider value={value}>
			{children}
			<Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
				<Pressable style={styles.backdrop} onPress={close} />
				<Animated.View style={[styles.panel, { transform: [{ translateX: x }] }]}>
					<DrawerContent onNavigate={close} />
				</Animated.View>
			</Modal>
		</DrawerContext.Provider>
	);
}

type Filter = "teach" | "practice" | "all";

function DrawerContent({ onNavigate }: { onNavigate: () => void }) {
	const insets = useSafeAreaInsets();
	const { chats, remove, rename } = useSessions();
	const pathname = usePathname();
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<Filter>("all");
	const [renaming, setRenaming] = useState<ChatListItem | null>(null);
	const [renameText, setRenameText] = useState("");

	const commitRename = () => {
		const t = renameText.trim();
		if (renaming && t && t !== renaming.title) void rename(renaming.id, t);
		setRenaming(null);
	};

	const go = (href: string) => {
		onNavigate();
		router.replace(href as never);
	};

	const shown = useMemo(() => {
		const q = query.trim().toLowerCase();
		return (chats ?? []).filter((c) => (filter === "all" || c.kind === filter) && (!q || c.title.toLowerCase().includes(q)));
	}, [chats, query, filter]);

	const onLongPress = (c: ChatListItem) => {
		Alert.alert(c.title, undefined, [
			{
				text: "Rename",
				onPress: () => {
					setRenameText(c.title);
					setRenaming(c);
				},
			},
			{
				text: "Delete",
				style: "destructive",
				onPress: () =>
					Alert.alert("Delete this session?", "What you learned stays in your knowledge graph.", [
						{ text: "Cancel", style: "cancel" },
						{
							text: "Delete",
							style: "destructive",
							onPress: () => {
								void remove(c.id);
								if (pathname === `/chat/${c.id}`) go("/");
							},
						},
					]),
			},
			{ text: "Cancel", style: "cancel" },
		]);
	};

	return (
		<View style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
			<View style={styles.brand}>
				<Mark size={26} />
				<Text style={styles.brandText}>Petrov</Text>
			</View>

			<NavRow icon={<Plus size={20} color={colors.foreground} />} label="New teaching" onPress={() => go("/")} />
			<NavRow icon={<Dumbbell size={20} color={colors.foreground} />} label="New practice" onPress={() => go("/?mode=practice")} />

			<View style={styles.divider} />

			<View style={styles.searchRow}>
				<Text style={styles.sectionLabel}>Sessions</Text>
				<View style={styles.search}>
					<Search size={15} color={colors.mutedForeground} />
					<TextInput
						value={query}
						onChangeText={setQuery}
						placeholder="Search..."
						placeholderTextColor={colors.mutedForeground}
						style={styles.searchInput}
					/>
				</View>
			</View>
			<Segmented
				value={filter}
				onChange={setFilter}
				options={[
					{ value: "teach", label: "Teaching" },
					{ value: "practice", label: "Practice" },
					{ value: "all", label: "All" },
				]}
			/>

			<FlatList
				style={styles.list}
				data={shown}
				keyExtractor={(c) => c.id}
				ListEmptyComponent={
					chats === null ? (
						<ActivityIndicator color={colors.mutedForeground} style={{ marginTop: 24 }} />
					) : (
						<Text style={styles.empty}>{query ? "No matching sessions." : "No sessions yet."}</Text>
					)
				}
				renderItem={({ item }) => {
					const active = pathname === `/chat/${item.id}`;
					const meta = item.pendingQuestion ? "Question waiting" : item.pendingProblem ? "Problem waiting" : timeAgo(item.updatedAt);
					return (
						<Pressable
							onPress={() => go(`/chat/${item.id}`)}
							onLongPress={() => onLongPress(item)}
							style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && { opacity: 0.75 }]}
						>
							<View style={{ flex: 1 }}>
								<Text numberOfLines={1} style={[styles.rowTitle, active && { color: colors.primarySoft }]}>
									{item.title}
								</Text>
								<Text style={styles.rowMeta}>{meta}</Text>
							</View>
							{item.busy || item.compacting ? <ActivityIndicator size="small" color={colors.mutedForeground} /> : null}
						</Pressable>
					);
				}}
			/>

			<View style={styles.divider} />
			<NavRow icon={<Settings size={20} color={colors.foreground} />} label="Settings" onPress={() => go("/settings")} />

			<Modal visible={renaming !== null} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
				<View style={styles.dialogWrap}>
					<View style={styles.dialog}>
						<Text style={styles.dialogTitle}>Rename session</Text>
						<TextInput
							value={renameText}
							onChangeText={setRenameText}
							autoFocus
							selectTextOnFocus
							onSubmitEditing={commitRename}
							style={styles.dialogInput}
						/>
						<View style={styles.dialogActions}>
							<Pressable onPress={() => setRenaming(null)} style={styles.dialogBtn}>
								<Text style={styles.dialogBtnText}>Cancel</Text>
							</Pressable>
							<Pressable onPress={commitRename} style={styles.dialogBtn}>
								<Text style={[styles.dialogBtnText, { color: colors.primarySoft }]}>Save</Text>
							</Pressable>
						</View>
					</View>
				</View>
			</Modal>
		</View>
	);
}

function NavRow({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
	return (
		<Pressable onPress={onPress} style={({ pressed }) => [styles.nav, pressed && { backgroundColor: colors.accent }]}>
			{icon}
			<Text style={styles.navLabel}>{label}</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.55)" },
	panel: {
		position: "absolute",
		left: 0,
		top: 0,
		bottom: 0,
		width: WIDTH,
		backgroundColor: colors.background,
		borderRightWidth: 1,
		borderRightColor: colors.border,
	},
	content: { flex: 1, paddingHorizontal: 10, gap: 4 },
	brand: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, paddingVertical: 10, marginBottom: 6 },
	brandText: { color: colors.foreground, fontFamily: fonts.semibold, fontSize: 18 },
	nav: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 10, paddingVertical: 11, borderRadius: radius.md },
	navLabel: { color: colors.foreground, fontFamily: fonts.medium, fontSize: text.lg },
	divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
	searchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8, paddingLeft: 4 },
	sectionLabel: { color: colors.mutedForeground, fontFamily: fonts.medium, fontSize: text.sm },
	search: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		backgroundColor: colors.card,
		borderRadius: radius.pill,
		borderWidth: 1,
		borderColor: colors.border,
		paddingHorizontal: 12,
		height: 38,
	},
	searchInput: { flex: 1, color: colors.foreground, fontFamily: fonts.regular, fontSize: text.sm, paddingVertical: 0 },
	list: { flex: 1, marginTop: 8 },
	empty: { color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: text.sm, padding: 12 },
	row: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md },
	rowActive: { backgroundColor: colors.selected },
	rowTitle: { color: colors.foreground, fontFamily: fonts.medium, fontSize: text.base },
	rowMeta: { color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: text.xs, marginTop: 2 },
	dialogWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
	dialog: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 14 },
	dialogTitle: { color: colors.foreground, fontFamily: fonts.semibold, fontSize: text.lg },
	dialogInput: {
		color: colors.foreground,
		fontFamily: fonts.regular,
		fontSize: text.base,
		borderWidth: 1,
		borderColor: colors.input,
		borderRadius: radius.sm,
		paddingHorizontal: 12,
		height: 44,
	},
	dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
	dialogBtn: { paddingHorizontal: 14, paddingVertical: 8 },
	dialogBtnText: { color: colors.foreground, fontFamily: fonts.medium, fontSize: text.base },
});
