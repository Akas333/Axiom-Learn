import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Banner, Button, Card, Mark } from "@/components/ui";
import { normalizeBaseUrl, testConnection, useConnection, type Connection } from "@/lib/connection";
import { colors, fonts, radius, spacing, text } from "@/theme";

/**
 * Server URL + access token. Used on first launch and from Settings.
 * The pair is checked against the server before it's saved.
 */
export function ConnectForm({ initial, onDone }: { initial?: Connection | null; onDone?: () => void }) {
	const { save } = useConnection();
	const [url, setUrl] = useState(initial?.baseUrl ?? "");
	const [token, setToken] = useState(initial?.token ?? "");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const connect = async () => {
		const next = { baseUrl: normalizeBaseUrl(url), token: token.trim() };
		if (!next.baseUrl) return;
		setBusy(true);
		setError(null);
		const problem = await testConnection(next);
		setBusy(false);
		if (problem) {
			setError(problem);
			return;
		}
		await save(next);
		onDone?.();
	};

	return (
		<View style={{ gap: spacing[4] }}>
			<View style={styles.field}>
				<Text style={styles.label}>Server URL</Text>
				<TextInput
					value={url}
					onChangeText={setUrl}
					placeholder="https://your-workspace--petrov-api.modal.run"
					placeholderTextColor={colors.disabled}
					autoCapitalize="none"
					autoCorrect={false}
					keyboardType="url"
					style={styles.input}
				/>
				<Text style={styles.hint}>For a server on your laptop, use http://&lt;laptop-ip&gt;:8787 on the same Wi-Fi.</Text>
			</View>
			<View style={styles.field}>
				<Text style={styles.label}>Access token</Text>
				<TextInput
					value={token}
					onChangeText={setToken}
					placeholder="The shared token (leave empty for a local dev server)"
					placeholderTextColor={colors.disabled}
					autoCapitalize="none"
					autoCorrect={false}
					secureTextEntry
					style={styles.input}
				/>
			</View>
			{error ? <Banner status="error" title="Couldn't connect" description={error} /> : null}
			<Button label="Connect" variant="primary" size="lg" isLoading={busy} isDisabled={!url.trim()} onClick={() => void connect()} />
		</View>
	);
}

export function ConnectScreen() {
	const insets = useSafeAreaInsets();
	return (
		<KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
			<ScrollView contentContainerStyle={[styles.screen, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
				<View style={styles.brand}>
					<Mark size={40} />
					<Text style={styles.title}>Petrov</Text>
					<Text style={styles.subtitle}>An AI tutor that finds where your understanding ends, and teaches from there.</Text>
				</View>
				<Card padding={5}>
					<ConnectForm />
				</Card>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	screen: { flexGrow: 1, paddingHorizontal: spacing[5], gap: spacing[8] },
	brand: { alignItems: "center", gap: spacing[3] },
	title: { color: colors.foreground, fontFamily: fonts.semibold, fontSize: text.title },
	subtitle: { color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: text.base, textAlign: "center", lineHeight: 20 },
	field: { gap: 6 },
	label: { color: colors.foreground, fontFamily: fonts.medium, fontSize: text.sm },
	hint: { color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: text.xs },
	input: {
		color: colors.foreground,
		fontFamily: fonts.regular,
		fontSize: text.base,
		backgroundColor: colors.background,
		borderWidth: 1,
		borderColor: colors.input,
		borderRadius: radius.md,
		paddingHorizontal: spacing[3],
		height: 46,
	},
});
