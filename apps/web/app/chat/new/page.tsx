import { useSearchParams } from "react-router";
import { NewSession } from "@/components/new-session";
import { slotsConfigured } from "@/src/core";
import { useSettingsRecord } from "@/lib/api";

/**
 * The draft view behind "+ New session": no session exists until the first
 * message is sent; then it creates the chat and moves to its page.
 */
export default function NewSessionPage() {
	const [search] = useSearchParams();
	const record = useSettingsRecord();
	if (record.state !== "ready") return null;
	return (
		<NewSession
			initialConfigured={slotsConfigured(record.data?.models)}
			mode={search.get("mode") === "practice" ? "practice" : search.get("mode") === "textbook" ? "textbook" : "teach"}
			folderId={search.get("folder") ?? undefined}
		/>
	);
}
