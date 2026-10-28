import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import type { UserSettings } from "@/src/core";
import { ConnectForm } from "@/components/connect";
import { TopBar } from "@/components/top-bar";
import { Badge, Button, Card } from "@/components/ui";
import { getJSON, useConnection } from "@/lib/connection";
import { colors, fonts, spacing, text } from "@/theme";

const SLOT_LABELS: Record<string, string> = { strong: "Tutor (strong)", cheap: "Background (cheap)", vision: "Vision" };

export default function Settings() {
	const { api, conn, clear } = useConnection();
	const [settings, setSettings] = useState<UserSettings | null>(null);
	const [editing, setEditing] = useState(false);

	useEffect(() => {
		getJSON<{ settings: UserSettings | null }>(api, "/api/settings")
			.then((d) => setSettings(d.settings))
			.catch(() => {});
	}, [api]);

	const slots = (settings?.models ?? {}) as Record<string, { provider?: string; model?: string; thinkingLevel?: string } | undefined>;

	return (
		<View style={{ flex: 1, backgroundColor: colors.background }}>
			<TopBar title="Settings" />
			<ScrollView contentContainerStyle={styles.body}>
				<Text style={styles.section}>Server</Text>
				<Card padding={4} style={{ gap: spacing[3] }}>
					{editing ? (
						<ConnectForm initial={conn} onDone={() => setEditing(false)} />
					) : (
						<>
							<Text style={styles.value} numberOfLines={2}>
								{conn?.baseUrl}
							</Text>
							<Badge label={conn?.token ? "Access token saved" : "No access token"} variant={conn?.token ? "success" : "warning"} />
							<View style={styles.row}>
								<Button label="Change" size="sm" onClick={() => setEditing(true)} />
								<Button
									label="Disconnect"
									size="sm"
									variant="ghost"
									onClick={() =>
										Alert.alert("Disconnect from this server?", "Your sessions stay on the server.", [
											{ text: "Cancel", style: "cancel" },
											{ text: "Disconnect", style: "destructive", onPress: () => void clear() },
										])
									}
								/>
							</View>
						</>
					)}
				</Card>

				<Text style={styles.section}>Models</Text>
				<Card padding={4} style={{ gap: spacing[3] }}>
					{Object.keys(SLOT_LABELS).map((slot) => {
						const m = slots[slot];
						return (
							<View key={slot} style={styles.slot}>
								<Text style={styles.label}>{SLOT_LABELS[slot]}</Text>
								<Text style={styles.value}>{m?.model ? `${m.model}${m.thinkingLevel ? ` · ${m.thinkingLevel}` : ""}` : "Not set"}</Text>
							</View>
						);
					})}
					<Text style={styles.hint}>Models and provider keys are managed in the web app's Settings; both apps share them.</Text>
				</Card>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	body: { padding: spacing[4], gap: spacing[3] },
	section: { color: colors.mutedForeground, fontFamily: fonts.medium, fontSize: text.xs, letterSpacing: 0.5, marginTop: spacing[2] },
	row: { flexDirection: "row", gap: spacing[2] },
	slot: { gap: 2 },
	label: { color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: text.xs },
	value: { color: colors.foreground, fontFamily: fonts.medium, fontSize: text.base },
	hint: { color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: text.sm, lineHeight: 19 },
});
