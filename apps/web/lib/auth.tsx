import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import SignInPage from "@/components/sign-in";

/**
 * Hosted sign-in gate. The server publishes its Supabase config at
 * /auth/config only in hosted mode; desktop and local dev get a 404 there
 * and the app renders exactly as before, with no sign-in.
 *
 * Signed in, every token supabase-js holds (first sign-in and each refresh)
 * is posted to /auth/session, which stores it in an HttpOnly cookie, so the
 * app's plain fetch/EventSource/WebSocket calls are authenticated as-is.
 */

interface AuthState {
	/** null outside hosted mode. */
	supabase: SupabaseClient | null;
	email: string | null;
	signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ supabase: null, email: null, signOut: async () => {} });

export function useAuth(): AuthState {
	return useContext(AuthContext);
}

async function loadClient(): Promise<SupabaseClient | null> {
	const res = await fetch("/auth/config", { cache: "no-store" });
	if (!res.ok) return null;
	const { supabaseUrl, supabaseAnonKey } = (await res.json()) as { supabaseUrl: string; supabaseAnonKey: string };
	return createClient(supabaseUrl, supabaseAnonKey, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true } });
}

async function postSession(session: Session): Promise<boolean> {
	const res = await fetch("/auth/session", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
	return res.ok;
}

type Phase = { kind: "loading" } | { kind: "open" } | { kind: "signed-out"; supabase: SupabaseClient } | { kind: "signed-in"; supabase: SupabaseClient; email: string | null };

export function AuthGate({ children }: { children: ReactNode }) {
	const [phase, setPhase] = useState<Phase>({ kind: "loading" });

	useEffect(() => {
		let cancelled = false;
		let unsubscribe: (() => void) | undefined;
		void (async () => {
			const supabase = await loadClient().catch(() => null);
			if (cancelled) return;
			if (!supabase) return setPhase({ kind: "open" });
			const apply = async (session: Session | null) => {
				if (session && (await postSession(session))) {
					if (!cancelled) setPhase({ kind: "signed-in", supabase, email: session.user.email ?? null });
				} else if (!cancelled) {
					setPhase({ kind: "signed-out", supabase });
				}
			};
			const { data } = supabase.auth.onAuthStateChange((event, session) => {
				// INITIAL_SESSION is covered by getSession below.
				if (event !== "INITIAL_SESSION") void apply(session);
			});
			unsubscribe = () => data.subscription.unsubscribe();
			const { data: current } = await supabase.auth.getSession();
			await apply(current.session);
		})();
		return () => {
			cancelled = true;
			unsubscribe?.();
		};
	}, []);

	if (phase.kind === "loading") return null;
	if (phase.kind === "signed-out") return <SignInPage supabase={phase.supabase} />;
	if (phase.kind === "open") return <AuthContext.Provider value={{ supabase: null, email: null, signOut: async () => {} }}>{children}</AuthContext.Provider>;

	const { supabase, email } = phase;
	const signOut = async () => {
		await fetch("/auth/logout", { method: "POST" });
		await supabase.auth.signOut();
	};
	return <AuthContext.Provider value={{ supabase, email, signOut }}>{children}</AuthContext.Provider>;
}
