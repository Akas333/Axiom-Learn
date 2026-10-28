import { useLocalSearchParams } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
	activeProblemOf,
	findPendingToolCall,
	phaseTimeline,
	questionNeedsReveal,
	type ChatRecord,
	type LhMessage,
} from "@/src/core";
import { ChatComposer, ChatLayout } from "@/components/astryx/Chat";
import { continueMessage } from "@/components/cards";
import { PracticeDock, QuestionDock } from "@/components/docks";
import { TopBar } from "@/components/top-bar";
import { Transcript } from "@/components/transcript";
import { Badge, Banner, BusyLine, Spinner } from "@/components/ui";
import { getJSON, useConnection } from "@/lib/connection";
import { useServerEvent } from "@/lib/events";
import { useChatSession, visibleQueuedSteers } from "@/lib/session";
import { colors, fonts, spacing, text } from "@/theme";

type ChatResponse = ChatRecord & { turnInFlight: boolean; turnError?: string; compacting: boolean };

export default function ChatPage() {
	const { id = "", prompt } = useLocalSearchParams<{ id: string; prompt?: string }>();
	const { api } = useConnection();
	const [chat, setChat] = useState<ChatResponse | null>(null);
	const [failed, setFailed] = useState<number | null>(null);

	useEffect(() => {
		const ctrl = new AbortController();
		setChat(null);
		setFailed(null);
		getJSON<ChatResponse>(api, `/api/chats/${encodeURIComponent(id)}`, ctrl.signal).then(setChat, (err: { name?: string; status?: number }) => {
			if (err.name !== "AbortError") setFailed(err.status ?? 0);
		});
		return () => ctrl.abort();
	}, [api, id]);

	if (failed !== null) {
		return (
			<View style={styles.fill}>
				<TopBar title="Session" />
				<View style={styles.center}>
					<Text style={styles.muted}>{failed === 404 ? "This session doesn't exist." : "Couldn't load this session."}</Text>
				</View>
			</View>
		);
	}
	if (!chat) {
		return (
			<View style={styles.fill}>
				<TopBar title="" />
				<View style={styles.center}>
					<Spinner />
				</View>
			</View>
		);
	}
	return <ChatView key={chat.id} chat={chat} initialPrompt={prompt} />;
}

function ChatView({ chat, initialPrompt }: { chat: ChatResponse; initialPrompt?: string }) {
	const { api } = useConnection();
	const chatId = chat.id;
	const session = useChatSession({
		chatId,
		initialMessages: chat.messages,
		initialError: chat.turnError,
		initiallyInFlight: chat.turnInFlight,
		api,
	});
	const { messages, nativeMessages, status, error, send, steer, submitAnswer, dismissQuestion, setMessages, continueIfOwed, stop, clearError, resumeStream, setReattachSettled } = session;

	// Fallback liveness: a server-side turn this view isn't streaming yet.
	const [turnInFlight, setTurnInFlight] = useState(chat.turnInFlight);
	const [compacting, setCompacting] = useState(chat.compacting);
	const [draft, setDraft] = useState("");

	const localStream = status === "submitted" || status === "streaming";
	const busy = localStream || turnInFlight;
	const busyRef = useRef(busy);
	busyRef.current = busy;

	useEffect(() => {
		if (turnInFlight && localStream) setTurnInFlight(false);
	}, [turnInFlight, localStream]);

	// Adopt the server's record (the canonical transcript) and run any owed continuation.
	const syncFromServer = useCallback(async () => {
		try {
			const res = await api(`/api/chats/${encodeURIComponent(chatId)}`);
			if (!res.ok) return;
			const record = (await res.json()) as { messages?: LhMessage[]; turnError?: string; turnInFlight?: boolean; compacting?: boolean };
			if (typeof record.compacting === "boolean") setCompacting(record.compacting);
			if (!Array.isArray(record.messages)) return;
			if (record.turnInFlight) {
				setTurnInFlight(true);
				resumeStream();
				return;
			}
			setMessages(record.messages, record.turnError);
			continueIfOwed(record.messages);
		} catch {
			/* transient: the next event or send heals */
		}
	}, [api, chatId, setMessages, continueIfOwed, resumeStream]);

	setReattachSettled(() => {
		setTurnInFlight(false);
		void syncFromServer();
	});

	// First message of a new session, exactly once; otherwise pick up any owed continuation.
	const started = useRef(false);
	useEffect(() => {
		if (started.current) return;
		started.current = true;
		const hasTurns = chat.messages.some((m) => (m as { role?: string }).role === "user" || (m as { role?: string }).role === "assistant");
		if (initialPrompt && !hasTurns) send({ type: "text", text: initialPrompt });
		else if (!chat.turnInFlight) continueIfOwed(chat.messages);
		// mount-only
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Our stream ended: canonicalize onto the durable record.
	const prevStatus = useRef(status);
	useEffect(() => {
		const was = prevStatus.current;
		prevStatus.current = status;
		if ((was === "submitted" || was === "streaming") && status === "ready") void syncFromServer();
		if (was !== "error" && status === "error") void syncFromServer();
	}, [status, syncFromServer]);

	// Server-started turns (probe→plan handoff, job wakes, the other app) and silent writes.
	useServerEvent("turn-started", (p) => {
		if (p.chatId !== chatId || busyRef.current) return;
		setTurnInFlight(true);
		resumeStream();
	});
	useServerEvent("turn-settled", (p) => {
		if (p.chatId !== chatId || busyRef.current) return;
		void syncFromServer();
	});
	useServerEvent("record-changed", (p) => {
		if (p.chatId !== chatId || busyRef.current) return;
		void syncFromServer();
	});
	useServerEvent("compaction-changed", (p) => {
		if (p.chatId === chatId) setCompacting(Boolean(p.running));
	});
	useServerEvent("resync", () => {
		if (!localStream) void syncFromServer();
	});

	const queued = visibleQueuedSteers(session.steerQueue, nativeMessages);
	const pending = findPendingToolCall(messages as never);
	const activeProblem = activeProblemOf(nativeMessages);
	const phase = phaseTimeline(messages as never).at(-1) ?? "probe";
	const kind = chat.kind ?? "teach";

	const nextReady =
		kind === "practice" &&
		!pending &&
		!activeProblem &&
		!compacting &&
		!busy &&
		nativeMessages.some(
			(m) =>
				(m as { role?: string }).role === "assistant" &&
				Array.isArray((m as { content?: unknown[] }).content) &&
				(m as { content: Array<{ type?: string; name?: string }> }).content.some((b) => b.type === "toolCall" && b.name === "problem"),
		);

	const abort = () => {
		stop();
		void api("/api/activity/abort", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ kind: "turn", id: chatId }),
		}).catch(() => {});
	};

	const onComposerSubmit = (value: string) => {
		if (compacting) return;
		if (busy) steer(value);
		else send({ type: "text", text: value });
	};

	let dockNode;
	if (pending) {
		dockNode = (
			<QuestionDock
				key={pending.toolCallId}
				toolName={pending.tool as "quiz"}
				toolCallId={pending.toolCallId}
				input={pending.input}
				needsReveal={questionNeedsReveal(pending.tool, pending.input, phase)}
				isDisabled={compacting || busy}
				onSubmit={(answer) => submitAnswer(pending.tool, pending.toolCallId, answer)}
				onSkip={(answer) => dismissQuestion(pending.toolCallId, answer)}
			/>
		);
	} else if (activeProblem) {
		dockNode = (
			<PracticeDock
				problemCallId={activeProblem.toolCallId}
				statement={String((activeProblem.input as { statement?: unknown })?.statement ?? "")}
				isDisabled={compacting || busy}
				onSubmit={(t) => send({ type: "thinking", problemCallId: activeProblem.toolCallId, text: t })}
			/>
		);
	} else {
		dockNode = (
			<ChatComposer
				value={draft}
				onChange={setDraft}
				onSubmit={onComposerSubmit}
				onStop={abort}
				isStopShown={busy && draft.trim().length === 0}
				isDisabled={compacting}
				placeholder={busy ? "Steer the lesson…" : "Ask, answer, or steer the lesson"}
				drawer={
					queued.length > 0 ? (
						<Text style={styles.queued} numberOfLines={2}>
							Queued: {queued.map((s) => s.text).join(" · ")}
						</Text>
					) : nextReady ? (
						<Pressable onPress={() => send({ type: "next" })} style={styles.nextChip}>
							<Text style={styles.nextText}>Next problem</Text>
							<ArrowRight size={14} color={colors.primary} />
						</Pressable>
					) : null
				}
			/>
		);
	}

	return (
		<ChatLayout
			header={<TopBar title={chat.title} right={<Badge label={phase === "probe" ? "Probing" : phase === "plan" ? "Planning" : "Teaching"} />} />}
			isEmpty={messages.length === 0 && !busy}
			emptyState={
				<View style={{ alignItems: "center", gap: spacing[2] }}>
					<Text style={styles.emptyTitle}>New session</Text>
					<Text style={styles.muted}>The tutor will open by probing what you already know.</Text>
				</View>
			}
			composer={dockNode}
		>
			<Transcript
				messages={messages}
				streaming={status === "streaming"}
				conceptLive={!busy && !pending && !compacting}
				onContinue={(next) => send({ type: "text", text: continueMessage(next) })}
			/>
			{compacting ? <BusyLine label="Compacting context…" /> : null}
			{status === "submitted" || turnInFlight ? <BusyLine label="Thinking…" /> : null}
			{error ? <Banner status="error" title="Something went wrong" description={readableError(error.message)} isDismissable onDismiss={clearError} /> : null}
		</ChatLayout>
	);
}

/** Refusal envelopes arrive as raw JSON text; show their message. */
function readableError(raw: string): string {
	try {
		const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown };
		if (typeof parsed.error === "string") return parsed.error;
		if (typeof parsed.message === "string") return parsed.message;
	} catch {
		/* plain text */
	}
	return raw;
}

const styles = StyleSheet.create({
	fill: { flex: 1, backgroundColor: colors.background },
	center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing[6] },
	muted: { color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: text.base, textAlign: "center" },
	emptyTitle: { color: colors.foreground, fontFamily: fonts.semibold, fontSize: text.xl },
	queued: { color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: text.xs, paddingHorizontal: spacing[3], paddingBottom: spacing[1] },
	nextChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		alignSelf: "center",
		paddingHorizontal: spacing[3],
		paddingVertical: 6,
		marginBottom: spacing[1],
		borderRadius: 999,
		borderWidth: 1,
		borderColor: colors.primary,
		backgroundColor: colors.selected,
	},
	nextText: { color: colors.primary, fontFamily: fonts.medium, fontSize: text.sm },
});
