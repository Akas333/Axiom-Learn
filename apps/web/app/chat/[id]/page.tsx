import { useParams, useSearchParams } from "react-router";
import { Chat } from "@/components/chat";
import { slotsConfigured, type ChatRecord } from "@/src/core";
import { useApi, useSettingsRecord } from "@/lib/api";

/** GET /api/chats/:id — the record plus its live turn state. */
type ChatResponse = ChatRecord & {
	turnInFlight: boolean;
	turnError: Parameters<typeof Chat>[0]["initialError"];
	compacting: boolean;
};

export default function ChatPage() {
	const { id = "" } = useParams();
	const [search] = useSearchParams();
	const chat = useApi<ChatResponse>(`/api/chats/${encodeURIComponent(id)}`);
	const record = useSettingsRecord();

	if (chat.state === "error") {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				{chat.status === 404 ? "This session doesn't exist." : "Couldn't load this session."}
			</div>
		);
	}
	if (chat.state !== "ready" || record.state !== "ready") return null;
	const c = chat.data;
	return (
		<Chat
			key={c.id}
			chatId={c.id}
			title={c.title}
			kind={c.kind ?? "teach"}
			style={c.style}
			course={c.course}
			initialMessages={c.messages}
			initialError={c.turnError}
			initialConfigured={slotsConfigured(record.data?.models)}
			initialPrompt={search.get("prompt") ?? undefined}
			// A turn that outlived its client: the remounted view attaches to it.
			initiallyInFlight={c.turnInFlight}
			initiallyCompacting={c.compacting}
		/>
	);
}
