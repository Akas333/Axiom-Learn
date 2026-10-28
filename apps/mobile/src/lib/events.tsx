import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { AppState } from "react-native";
import { useConnection } from "@/lib/connection";

/**
 * The server's notification channel (GET /api/events, SSE): frames carry an
 * event type and a tiny payload; listeners respond by fetching truth. Phones
 * drop connections (sleep, network switches), so this reconnects with
 * backoff and emits "resync" after every reconnect so views can refetch.
 */
type Payload = Record<string, unknown>;
type Listener = (payload: Payload) => void;

class EventBus {
	private listeners = new Map<string, Set<Listener>>();
	on(type: string, fn: Listener): () => void {
		let set = this.listeners.get(type);
		if (!set) this.listeners.set(type, (set = new Set()));
		set.add(fn);
		return () => set!.delete(fn);
	}
	emit(type: string, payload: Payload): void {
		for (const fn of this.listeners.get(type) ?? []) {
			try {
				fn(payload);
			} catch (err) {
				console.warn(`[events] listener failed on ${type}`, err);
			}
		}
	}
}

const BusContext = createContext<EventBus | null>(null);

export function ServerEventsProvider({ children }: { children: ReactNode }) {
	const { api, conn } = useConnection();
	const busRef = useRef<EventBus>(new EventBus());

	useEffect(() => {
		if (!conn) return;
		let stopped = false;
		let ctrl: AbortController | null = null;
		let attempt = 0;
		let connectedOnce = false;

		const run = async () => {
			while (!stopped) {
				ctrl = new AbortController();
				try {
					const res = await api("/api/events", { signal: ctrl.signal, headers: { Accept: "text/event-stream" } });
					if (!res.ok || !res.body) throw new Error(`events ${res.status}`);
					attempt = 0;
					if (connectedOnce) busRef.current.emit("resync", {});
					connectedOnce = true;
					const reader = res.body.getReader();
					const decoder = new TextDecoder();
					let buf = "";
					for (;;) {
						const { done, value } = await reader.read();
						if (done) break;
						buf += decoder.decode(value, { stream: true });
						for (;;) {
							const end = buf.indexOf("\n\n");
							if (end === -1) break;
							const frame = buf.slice(0, end);
							buf = buf.slice(end + 2);
							let type = "message";
							let data = "";
							for (const line of frame.split("\n")) {
								if (line.startsWith("event: ")) type = line.slice(7);
								else if (line.startsWith("data: ")) data += line.slice(6);
							}
							if (!data) continue; // ": ping" heartbeats
							try {
								busRef.current.emit(type, JSON.parse(data) as Payload);
							} catch {
								/* malformed frame: skip */
							}
						}
					}
				} catch {
					/* dropped or refused: back off and retry */
				}
				if (stopped) return;
				attempt++;
				await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** Math.min(attempt, 5), 30_000)));
			}
		};
		void run();

		// Coming back to the foreground: the socket is likely dead; restart now.
		const sub = AppState.addEventListener("change", (state) => {
			if (state === "active") ctrl?.abort();
		});
		return () => {
			stopped = true;
			ctrl?.abort();
			sub.remove();
		};
	}, [api, conn]);

	return <BusContext.Provider value={busRef.current}>{children}</BusContext.Provider>;
}

/** Subscribe to one server event type for the component's lifetime. */
export function useServerEvent(type: string, handler: (payload: Payload) => void): void {
	const bus = useContext(BusContext);
	const ref = useRef(handler);
	ref.current = handler;
	useEffect(() => {
		if (!bus) return;
		return bus.on(type, (p) => ref.current(p));
	}, [bus, type]);
}
