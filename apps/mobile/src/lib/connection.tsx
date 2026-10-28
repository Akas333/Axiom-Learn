import * as ExpoSecureStore from "expo-secure-store";
import { fetch as expoFetch } from "expo/fetch";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";

/** The device keystore on phones; localStorage in a browser (dev testing only). */
const SecureStore =
	Platform.OS === "web"
		? {
				getItemAsync: async (k: string) => globalThis.localStorage?.getItem(k) ?? null,
				setItemAsync: async (k: string, v: string) => globalThis.localStorage?.setItem(k, v),
				deleteItemAsync: async (k: string) => globalThis.localStorage?.removeItem(k),
			}
		: ExpoSecureStore;

/** Where the API lives and the shared access token (stored in the device keystore). */
export interface Connection {
	baseUrl: string;
	token: string;
}

const KEY_URL = "petrov.baseUrl";
const KEY_TOKEN = "petrov.token";

export function normalizeBaseUrl(raw: string): string {
	let url = raw.trim().replace(/\/+$/, "");
	if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
	return url;
}

/**
 * A fetch bound to one connection: relative "/api/..." paths resolve against
 * the base URL and every request carries the access token. Uses expo/fetch,
 * which streams response bodies (the turn and events SSE need that).
 * Shaped like the global fetch so the shared SessionModel can take it.
 */
export function makeApiFetch(conn: Connection): typeof globalThis.fetch {
	const apiFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
		const url = raw.startsWith("/") ? `${conn.baseUrl}${raw}` : raw;
		const headers: Record<string, string> = {};
		new Headers(init?.headers).forEach((v, k) => {
			headers[k] = v;
		});
		if (conn.token) headers.authorization = `Bearer ${conn.token}`;
		return expoFetch(url, {
			method: init?.method,
			body: init?.body as string | undefined,
			headers,
			signal: init?.signal ?? undefined,
		}) as unknown as Promise<Response>;
	};
	return apiFetch as typeof globalThis.fetch;
}

/** Check a URL + token pair before saving it. Returns an error message or null. */
export async function testConnection(conn: Connection): Promise<string | null> {
	try {
		const res = await makeApiFetch(conn)("/api/settings");
		if (res.status === 401) return "The access token was not accepted.";
		if (!res.ok) return `The server answered ${res.status}.`;
		await res.json();
		return null;
	} catch (err) {
		return `Couldn't reach the server: ${(err as Error).message}`;
	}
}

interface ConnectionContextValue {
	conn: Connection | null;
	loaded: boolean;
	api: typeof globalThis.fetch;
	save: (conn: Connection) => Promise<void>;
	clear: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
	const [conn, setConn] = useState<Connection | null>(null);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		void (async () => {
			try {
				const [baseUrl, token] = await Promise.all([SecureStore.getItemAsync(KEY_URL), SecureStore.getItemAsync(KEY_TOKEN)]);
				if (baseUrl) setConn({ baseUrl, token: token ?? "" });
			} finally {
				setLoaded(true);
			}
		})();
	}, []);

	const save = useCallback(async (next: Connection) => {
		await SecureStore.setItemAsync(KEY_URL, next.baseUrl);
		await SecureStore.setItemAsync(KEY_TOKEN, next.token);
		setConn(next);
	}, []);

	const clear = useCallback(async () => {
		await SecureStore.deleteItemAsync(KEY_URL);
		await SecureStore.deleteItemAsync(KEY_TOKEN);
		setConn(null);
	}, []);

	const api = useMemo(() => makeApiFetch(conn ?? { baseUrl: "", token: "" }), [conn]);
	const value = useMemo(() => ({ conn, loaded, api, save, clear }), [conn, loaded, api, save, clear]);
	return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionContextValue {
	const ctx = useContext(ConnectionContext);
	if (!ctx) throw new Error("useConnection outside ConnectionProvider");
	return ctx;
}

/** GET JSON through the connection; throws with the status on failure. */
export async function getJSON<T>(api: typeof globalThis.fetch, path: string, signal?: AbortSignal): Promise<T> {
	const res = await api(path, { signal });
	if (!res.ok) throw Object.assign(new Error(`${path} → ${res.status}`), { status: res.status });
	return (await res.json()) as T;
}
