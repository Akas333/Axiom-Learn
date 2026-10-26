import { useEffect, useState } from "react";
import type { UserSettings } from "@/src/core";

/** GET JSON from the API; throws with the server's status on failure. */
export async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
	const res = await fetch(url, { signal, cache: "no-store" });
	if (!res.ok) throw Object.assign(new Error(`${url} → ${res.status}`), { status: res.status });
	return (await res.json()) as T;
}

type Loadable<T> = { state: "loading" } | { state: "ready"; data: T } | { state: "error"; status?: number };

/** Fetch once per `url` change (pages re-read on every navigation, like the
 *  old dynamic Next routes did). */
export function useApi<T>(url: string): Loadable<T> {
	const [result, setResult] = useState<Loadable<T>>({ state: "loading" });
	useEffect(() => {
		const ctrl = new AbortController();
		setResult({ state: "loading" });
		getJSON<T>(url, ctrl.signal).then(
			(data) => setResult({ state: "ready", data }),
			(err: { name?: string; status?: number }) => {
				if (err.name !== "AbortError") setResult({ state: "error", status: err.status });
			},
		);
		return () => ctrl.abort();
	}, [url]);
	return result;
}

/** The raw settings record (null before first save), as the pages need it. */
export function useSettingsRecord(): Loadable<UserSettings | null> {
	const res = useApi<{ settings: UserSettings | null }>("/api/settings");
	return res.state === "ready" ? { state: "ready", data: res.data.settings } : res;
}
