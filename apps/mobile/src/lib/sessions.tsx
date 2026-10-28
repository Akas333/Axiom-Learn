import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChatListItem } from "@/src/core";
import { useConnection } from "@/lib/connection";
import { useServerEvent } from "@/lib/events";

/** The sidebar's session list, kept fresh by server events (like the web sidebar). */
interface SessionsValue {
	chats: ChatListItem[] | null;
	refresh: () => void;
	remove: (id: string) => Promise<void>;
	rename: (id: string, title: string) => Promise<void>;
}

const SessionsContext = createContext<SessionsValue | null>(null);

export function SessionsProvider({ children }: { children: ReactNode }) {
	const { api, conn } = useConnection();
	const [chats, setChats] = useState<ChatListItem[] | null>(null);
	const inFlight = useRef(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const refresh = useCallback(async () => {
		if (!conn || inFlight.current) return;
		inFlight.current = true;
		try {
			const res = await api("/api/chats");
			if (res.ok) setChats(((await res.json()) as { chats: ChatListItem[] }).chats);
		} catch {
			setChats((prev) => prev ?? []);
		} finally {
			inFlight.current = false;
		}
	}, [api, conn]);

	const schedule = useCallback(() => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => void refresh(), 250);
	}, [refresh]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useServerEvent("chats-changed", schedule);
	useServerEvent("turn-started", schedule);
	useServerEvent("turn-settled", schedule);
	useServerEvent("compaction-changed", schedule);
	useServerEvent("resync", schedule);

	const remove = useCallback(
		async (id: string) => {
			setChats((prev) => prev?.filter((c) => c.id !== id) ?? prev);
			// preserve-graph: delete the session, keep what it taught in the knowledge graph.
			await api(`/api/chats/${encodeURIComponent(id)}?mode=preserve-graph`, { method: "DELETE" }).catch(() => {});
			void refresh();
		},
		[api, refresh],
	);

	const rename = useCallback(
		async (id: string, title: string) => {
			setChats((prev) => prev?.map((c) => (c.id === id ? { ...c, title } : c)) ?? prev);
			await api(`/api/chats/${encodeURIComponent(id)}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title }),
			}).catch(() => {});
		},
		[api],
	);

	const value = useMemo(() => ({ chats, refresh: () => void refresh(), remove, rename }), [chats, refresh, remove, rename]);
	return <SessionsContext.Provider value={value}>{children}</SessionsContext.Provider>;
}

export function useSessions(): SessionsValue {
	const ctx = useContext(SessionsContext);
	if (!ctx) throw new Error("useSessions outside SessionsProvider");
	return ctx;
}

/** "2m ago", like the web sidebar. */
export function timeAgo(iso: string): string {
	const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
	if (s < 60) return "just now";
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
	return new Date(iso).toLocaleDateString();
}
