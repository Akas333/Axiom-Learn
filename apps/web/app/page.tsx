import { Home } from "@/components/home";
import { resolveSettings, slotsConfigured } from "@/src/core";
import { useSettingsRecord } from "@/lib/api";

export default function HomePage() {
	// First-run gate: chats cannot start until all three model slots are
	// picked. Graph rendering off = the home's main view is the chains view.
	const record = useSettingsRecord();
	if (record.state !== "ready") return null;
	const rendering = resolveSettings(record.data ?? null).graph.rendering;
	return <Home initialConfigured={slotsConfigured(record.data?.models)} rendering={rendering} />;
}
