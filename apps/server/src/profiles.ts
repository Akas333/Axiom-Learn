import type { Context, Hono } from "hono";
import { currentTenant } from "@axiom/engine/tenant.ts";
import { currentPlan, savePlan, type PlanId } from "@axiom/engine/src/server/hosted.ts";
import type { AuthConfig } from "./auth.ts";

/**
 * User profiles in Supabase (supabase/migrations/*_profiles.sql).
 *
 * Reads and edits go to PostgREST with the USER's own access token, so the
 * table's row-level security is the access check. Plan fields are written
 * only with the server's service key (Stripe webhook). The plan is mirrored
 * into the user's local plan.json, which the quota check reads on every
 * lesson; the database row is the durable copy.
 */

export interface Profile {
	id: string;
	email: string | null;
	display_name: string | null;
	avatar_url: string | null;
	plan: PlanId;
	plan_status: string | null;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	created_at: string;
}

const PROFILE_COLUMNS = "id,email,display_name,avatar_url,plan,plan_status,stripe_customer_id,stripe_subscription_id,created_at";

function restHeaders(apiKey: string, bearer?: string): Record<string, string> {
	const headers: Record<string, string> = { apikey: apiKey, "Content-Type": "application/json" };
	// New-style secret keys (sb_secret_…) go in apikey only; JWTs also as bearer.
	const token = bearer ?? (apiKey.startsWith("eyJ") ? apiKey : undefined);
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

export async function fetchProfile(config: AuthConfig, userToken: string, userId: string): Promise<Profile | null> {
	const res = await fetch(`${config.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=${PROFILE_COLUMNS}`, {
		headers: restHeaders(config.supabaseAnonKey, userToken),
	});
	if (!res.ok) throw new Error(`Profile read failed (${res.status})`);
	const rows = (await res.json()) as Profile[];
	return rows[0] ?? null;
}

export interface ProfileEdit {
	display_name?: string | null;
	avatar_url?: string | null;
}

/** Validate a PUT body into the two user-editable columns. */
export function parseProfileEdit(body: unknown): { ok: true; edit: ProfileEdit } | { ok: false; error: string } {
	if (!body || typeof body !== "object") return { ok: false, error: "Expected a JSON object" };
	const raw = body as Record<string, unknown>;
	const edit: ProfileEdit = {};
	if ("display_name" in raw) {
		const name = raw.display_name;
		if (name !== null && typeof name !== "string") return { ok: false, error: "display_name must be text" };
		const trimmed = typeof name === "string" ? name.trim() : "";
		if (trimmed.length > 80) return { ok: false, error: "Name is too long (80 characters max)" };
		edit.display_name = trimmed || null;
	}
	if ("avatar_url" in raw) {
		const url = raw.avatar_url;
		if (url !== null && typeof url !== "string") return { ok: false, error: "avatar_url must be text" };
		const trimmed = typeof url === "string" ? url.trim() : "";
		if (trimmed) {
			let parsed: URL;
			try {
				parsed = new URL(trimmed);
			} catch {
				return { ok: false, error: "Picture must be a full https:// link" };
			}
			if (parsed.protocol !== "https:" || trimmed.length > 2048) return { ok: false, error: "Picture must be a full https:// link" };
		}
		edit.avatar_url = trimmed || null;
	}
	if (Object.keys(edit).length === 0) return { ok: false, error: "Nothing to update" };
	return { ok: true, edit };
}

export async function updateProfile(config: AuthConfig, userToken: string, userId: string, edit: ProfileEdit): Promise<Profile | null> {
	const res = await fetch(`${config.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=${PROFILE_COLUMNS}`, {
		method: "PATCH",
		headers: { ...restHeaders(config.supabaseAnonKey, userToken), Prefer: "return=representation" },
		body: JSON.stringify(edit),
	});
	if (!res.ok) throw new Error(`Profile update failed (${res.status})`);
	const rows = (await res.json()) as Profile[];
	return rows[0] ?? null;
}

/** Server-only: write plan fields (service key bypasses RLS). */
export async function writeProfilePlan(
	config: AuthConfig,
	userId: string,
	fields: { plan: PlanId; plan_status?: string; stripe_customer_id?: string; stripe_subscription_id?: string },
): Promise<void> {
	if (!config.serviceKey) return;
	const res = await fetch(`${config.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
		method: "PATCH",
		headers: { ...restHeaders(config.serviceKey), Prefer: "return=minimal" },
		body: JSON.stringify(fields),
	});
	if (!res.ok) throw new Error(`Plan write failed (${res.status})`);
}

/** Bring the local plan cache in line with the profile row. */
export function mirrorPlan(profile: Profile): void {
	const local = currentPlan();
	if (local.plan === profile.plan && (local.status ?? null) === (profile.plan_status ?? null)) return;
	savePlan({
		plan: profile.plan,
		status: profile.plan_status ?? undefined,
		stripeCustomerId: profile.stripe_customer_id ?? undefined,
		stripeSubscriptionId: profile.stripe_subscription_id ?? undefined,
	});
}

/** GET/PUT /api/profile (under the signed-in /api gate). */
export function mountProfileRoutes(app: Hono, config: AuthConfig, tokenOf: (c: Context) => string | undefined): void {
	app.get("/api/profile", async (c) => {
		const tenant = currentTenant()!;
		const token = tokenOf(c);
		if (!token) return c.json({ error: "Sign in required" }, 401);
		try {
			const profile = await fetchProfile(config, token, tenant.userId);
			if (profile) mirrorPlan(profile);
			return c.json({ profile });
		} catch (err) {
			return c.json({ error: (err as Error).message }, 502);
		}
	});

	app.put("/api/profile", async (c) => {
		const tenant = currentTenant()!;
		const token = tokenOf(c);
		if (!token) return c.json({ error: "Sign in required" }, 401);
		const parsed = parseProfileEdit(await c.req.json().catch(() => null));
		if (!parsed.ok) return c.json({ error: parsed.error }, 400);
		try {
			const profile = await updateProfile(config, token, tenant.userId, parsed.edit);
			if (!profile) return c.json({ error: "Profile not found" }, 404);
			return c.json({ profile });
		} catch (err) {
			return c.json({ error: (err as Error).message }, 502);
		}
	});
}
