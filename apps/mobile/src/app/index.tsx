import { router, useLocalSearchParams } from "expo-router";
import { BookOpen, Dumbbell } from "lucide-react-native";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { slotsConfigured, type UserSettings } from "@/src/core";
import { ChatComposer } from "@/components/astryx/Chat";
import { TopBar } from "@/components/top-bar";
import { Banner, Segmented } from "@/components/ui";
import { getJSON, useConnection } from "@/lib/connection";
import { timeAgo, useSessions } from "@/lib/sessions";
import { colors, fonts, radius, spacing, text } from "@/theme";

type Mode = "teach" | "practice";

/** New session: "What do you want to learn?" — creates the chat, then opens it with the prompt. */
export default function Home() {
	const params = useLocalSearchParams<{ mode?: string }>();
	const [mode, setMode] = useState<Mode>(params.mode === "practice" ? "practice" : "teach");
	const { api } = useConnection();
	const { chats } = useSessions();
	const insets = useSafeAreaInsets();
	const [draft, setDraft] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [configured, setConfigured] = useState(true);

	useEffect(() => setMode(params.mode === "practice" ? "practice" : "teach"), [params.mode]);

	useEffect(() => {
		getJSON<{ settings: UserSettings | null }>(api, "/api/settings")
			.then((d) => setConfigured(slotsConfigured(d.settings?.models)))
			.catch(() => {});
	}, [api]);

	const start = async (prompt: string) => {
		const t = prompt.trim();
		if (!t || busy) return;
		setBusy(true);
		setError(null);
		try {
			const res = await api("/api/chats", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(mode === "practice" ? { title: t, kind: "practice" } : { title: t }),
			});
			if (!res.ok) throw new Error(`The server answered ${res.status}.`);
			const { id } = (await res.json()) as { id: string };
			setDraft("");
			router.push({ pathname: "/chat/[id]", params: { id, prompt: t } });
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setBusy(false);
		}
	};

	const recent = (chats ?? []).slice(0, 4);

	return (
		<KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
			<TopBar title="Petrov" />
			<ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
				<View style={styles.hero}>
					<Text style={styles.title}>{mode === "practice" ? "Practice" : "What do you want to learn?"}</Text>
					<Text style={styles.subtitle}>
						{mode === "practice"
							? "Varied problems where you recall the right idea yourself. Name a topic to practice."
							: "The tutor first measures what you already know, plans a path, then teaches one step at a time."}
					</Text>
				</View>
				{!configured ? (
					<Banner status="warning" title="Models aren't set up yet" description="Open Settings → Agent in the web app and pick models for the three slots." />
				) : null}
				{error ? <Banner status="error" title="Couldn't start the session" description={error} isDismissable onDismiss={() => setError(null)} /> : null}
				{recent.length > 0 ? (
					<View style={{ gap: spacing[2] }}>
						<Text style={styles.section}>Recent</Text>
						{recent.map((c) => (
							<Pressable
								key={c.id}
								onPress={() => router.push({ pathname: "/chat/[id]", params: { id: c.id } })}
								style={({ pressed }) => [styles.recent, pressed && { opacity: 0.8 }]}
							>
								{c.kind === "practice" ? <Dumbbell size={16} color={colors.mutedForeground} /> : <BookOpen size={16} color={colors.mutedForeground} />}
								<Text numberOfLines={1} style={styles.recentTitle}>
									{c.title}
								</Text>
								<Text style={styles.recentMeta}>{c.pendingQuestion ? "Question waiting" : timeAgo(c.updatedAt)}</Text>
							</Pressable>
						))}
					</View>
				) : null}
			</ScrollView>
			<View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing[2]) }]}>
				<ChatComposer
					value={draft}
					onChange={setDraft}
					onSubmit={(v) => void start(v)}
					placeholder={mode === "practice" ? "What do you want to practice?" : "What do you want to learn?"}
					isDisabled={busy}
					primarySend
					footerActions={
						<Segmented
							small
							value={mode}
							onChange={setMode}
							options={[
								{ value: "teach", label: "Teach" },
								{ value: "practice", label: "Practice" },
							]}
						/>
					}
				/>
			</View>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1, backgroundColor: colors.background },
	body: { flexGrow: 1, justifyContent: "center", padding: spacing[5], gap: spacing[6] },
	hero: { alignItems: "center", gap: spacing[3] },
	title: { color: colors.foreground, fontFamily: fonts.semibold, fontSize: text.title, textAlign: "center", lineHeight: 34 },
	subtitle: { color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: text.base, textAlign: "center", lineHeight: 20 },
	section: { color: colors.mutedForeground, fontFamily: fonts.medium, fontSize: text.xs, letterSpacing: 0.5 },
	recent: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing[3],
		backgroundColor: colors.surface,
		borderRadius: radius.md,
		borderWidth: 1,
		borderColor: colors.border,
		paddingHorizontal: spacing[3],
		paddingVertical: spacing[3],
	},
	recentTitle: { flex: 1, color: colors.foreground, fontFamily: fonts.medium, fontSize: text.base },
	recentMeta: { color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: text.xs },
	dock: { paddingHorizontal: spacing[3], paddingTop: spacing[1] },
});
