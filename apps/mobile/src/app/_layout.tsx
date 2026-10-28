import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from "@expo-google-fonts/figtree";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConnectScreen } from "@/components/connect";
import { DrawerProvider } from "@/components/drawer";
import { Spinner } from "@/components/ui";
import { ConnectionProvider, useConnection } from "@/lib/connection";
import { ServerEventsProvider } from "@/lib/events";
import { SessionsProvider } from "@/lib/sessions";
import { colors } from "@/theme";

export default function RootLayout() {
	const [fontsLoaded] = useFonts({
		Figtree_400Regular,
		Figtree_500Medium,
		Figtree_600SemiBold,
		Figtree_700Bold,
		JetBrainsMono_400Regular,
	});
	return (
		<SafeAreaProvider>
			<StatusBar style="light" />
			<View style={{ flex: 1, backgroundColor: colors.background }}>
				{fontsLoaded ? (
					<ConnectionProvider>
						<Gate />
					</ConnectionProvider>
				) : null}
			</View>
		</SafeAreaProvider>
	);
}

/** No server saved yet → the connect screen; otherwise the app. */
function Gate() {
	const { conn, loaded } = useConnection();
	if (!loaded) {
		return (
			<View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
				<Spinner />
			</View>
		);
	}
	if (!conn) return <ConnectScreen />;
	return (
		<ServerEventsProvider>
			<SessionsProvider>
				<DrawerProvider>
					<Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "fade" }} />
				</DrawerProvider>
			</SessionsProvider>
		</ServerEventsProvider>
	);
}
