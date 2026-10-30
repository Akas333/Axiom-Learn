/**
 * Hosted (multi-user) mode: per-user keys, plans and the free-tier quota.
 *
 * KEYS. pi-ai and several consumers read provider keys from process.env at
 * call time. On a shared server that would hand one user's key to everyone,
 * so installHostedEnv() replaces process.env with a view that answers key
 * names for the CURRENT USER (tenant.ts):
 *   - the user's own key from their auth.json, when they saved one;
 *   - otherwise the platform key the server was started with, but only for
 *     users with no provider key of their own (they are on the metered free
 *     or paid plan); curated non-model keys (search, speech) always fall back;
 *   - no signed-in user: no key at all.
 * Platform keys are removed from the real environment at boot, never
 * enumerated, and never shown in the keys settings page.
 *
 * PLANS. <user dir>/plan.json holds the plan Stripe last told us about
 * (apps/server billing webhook). <user dir>/usage.json counts teaching turns
 * on platform keys per calendar month (UTC). Users on their own keys are not
 * metered.
 */

import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "../../config.ts";
import { currentTenant, hostedMode } from "../../tenant.ts";
import { AUTH_KEYS, AUTH_PROVIDER_ENV_VARS } from "../core/auth-keys.ts";
import { authStore } from "../store/auth.ts";
import { settingsStore } from "../store/settings.ts";
import { CURRENT_SETTINGS_VERSION } from "../core/settings.ts";

export { hostedMode } from "../../tenant.ts";

// ─── Keys ───────────────────────────────────────────────────────────────────

interface HostedEnvGlobal {
	__lhHostedEnv?: { platform: Record<string, string> };
}

function hostedEnvState(): HostedEnvGlobal["__lhHostedEnv"] {
	return (globalThis as typeof globalThis & HostedEnvGlobal).__lhHostedEnv;
}

function managedKeyNames(): Set<string> {
	return new Set<string>([...AUTH_KEYS.map((k) => k.id), ...AUTH_PROVIDER_ENV_VARS]);
}

/** Does the current user hold a model-provider key of their own? */
export function userHasOwnProviderKey(vars: Record<string, string> = authStore.authVars()): boolean {
	return Object.entries(vars).some(([name, value]) => AUTH_PROVIDER_ENV_VARS.has(name) && value.trim().length > 0);
}

/** The key value the current user's requests should see for `name`. */
export function hostedKeyFor(name: string): string | undefined {
	const state = hostedEnvState();
	if (!state || !currentTenant()) return undefined;
	const own = authStore.authVars();
	const mine = own[name]?.trim();
	if (mine) return mine;
	if (AUTH_PROVIDER_ENV_VARS.has(name) && userHasOwnProviderKey(own)) return undefined;
	return state.platform[name];
}

/** Hosted boot: move platform keys out of the real env and install the
 *  per-user view. Idempotent; a no-op outside hosted mode. */
export function installHostedEnv(): void {
	if (!hostedMode() || hostedEnvState()) return;
	const real = process.env;
	const managed = managedKeyNames();
	const platform: Record<string, string> = {};
	for (const name of managed) {
		const value = real[name];
		if (typeof value === "string" && value.trim()) platform[name] = value.trim();
		delete real[name];
	}
	(globalThis as typeof globalThis & HostedEnvGlobal).__lhHostedEnv = { platform };
	process.env = new Proxy(real, {
		get(target, name, receiver) {
			if (typeof name === "string" && managed.has(name)) return hostedKeyFor(name);
			return Reflect.get(target, name, receiver);
		},
		has(target, name) {
			if (typeof name === "string" && managed.has(name)) return hostedKeyFor(name) !== undefined;
			return Reflect.has(target, name);
		},
		// Key writes from the keys service go to the user's auth.json instead.
		set(target, name, value, receiver) {
			if (typeof name === "string" && managed.has(name)) return true;
			return Reflect.set(target, name, value, receiver);
		},
		deleteProperty(target, name) {
			if (typeof name === "string" && managed.has(name)) return true;
			return Reflect.deleteProperty(target, name);
		},
		// Never enumerate keys: spreads and child processes get none.
		ownKeys(target) {
			return Reflect.ownKeys(target).filter((name) => typeof name !== "string" || !managed.has(name));
		},
		getOwnPropertyDescriptor(target, name) {
			if (typeof name === "string" && managed.has(name)) return undefined;
			return Reflect.getOwnPropertyDescriptor(target, name);
		},
	});
}

// ─── Plans and quota ────────────────────────────────────────────────────────

export type PlanId = "free" | "pro";

export interface PlanRecord {
	plan: PlanId;
	/** Stripe subscription status when on a paid plan (active, past_due, …). */
	status?: string;
	stripeCustomerId?: string;
	stripeSubscriptionId?: string;
	updatedAt: string;
}

interface UsageRecord {
	month: string;
	turns: number;
}

export interface QuotaStatus {
	plan: PlanId;
	/** True when the user runs on their own keys (no metering). */
	ownKeys: boolean;
	month: string;
	used: number;
	limit: number;
	remaining: number;
}

function readJson<T>(file: string): T | null {
	try {
		return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
	} catch {
		return null;
	}
}

function writeJson(file: string, value: unknown): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(value, null, "\t") + "\n", { encoding: "utf-8", mode: 0o600 });
	fs.renameSync(tmp, file);
}

const planFile = () => path.join(dataRoot(), "plan.json");
const usageFile = () => path.join(dataRoot(), "usage.json");

function monthKey(now = new Date()): string {
	return now.toISOString().slice(0, 7);
}

function envInt(name: string, fallback: number): number {
	const n = Number(process.env[name]);
	return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Monthly teaching turns on platform keys, per plan (env-tunable). */
export function planTurnLimit(plan: PlanId): number {
	return plan === "pro" ? envInt("KAPANY_PRO_TURNS", 2000) : envInt("KAPANY_FREE_TURNS", 50);
}

/** The current user's plan. A paid plan that Stripe reports as not paying
 *  falls back to free. */
export function currentPlan(): PlanRecord {
	const record = readJson<PlanRecord>(planFile());
	if (!record) return { plan: "free", updatedAt: new Date(0).toISOString() };
	if (record.plan === "pro" && record.status && !["active", "trialing"].includes(record.status)) {
		return { ...record, plan: "free" };
	}
	return record;
}

/** Write the current user's plan (billing webhook, inside runAsTenant). */
export function savePlan(update: Omit<PlanRecord, "updatedAt">): PlanRecord {
	const record: PlanRecord = { ...readJson<PlanRecord>(planFile()), ...update, updatedAt: new Date().toISOString() };
	writeJson(planFile(), record);
	return record;
}

export function quotaStatus(): QuotaStatus {
	const plan = currentPlan().plan;
	const month = monthKey();
	const usage = readJson<UsageRecord>(usageFile());
	const used = usage?.month === month ? usage.turns : 0;
	const limit = planTurnLimit(plan);
	return { plan, ownKeys: userHasOwnProviderKey(), month, used, limit, remaining: Math.max(0, limit - used) };
}

/** Count one teaching turn on platform keys. */
export function recordPlatformTurn(): void {
	const month = monthKey();
	const usage = readJson<UsageRecord>(usageFile());
	const turns = (usage?.month === month ? usage.turns : 0) + 1;
	writeJson(usageFile(), { month, turns } satisfies UsageRecord);
}

// ─── First sign-in ──────────────────────────────────────────────────────────

const seeded = new Set<string>();

/** Give a brand-new user working defaults: the platform model slots from
 *  KAPANY_DEFAULT_MODELS (a JSON `models` settings section). Cheap after the
 *  first call per user per process. */
export function seedNewUser(): void {
	const userId = currentTenant()?.userId;
	if (!userId || seeded.has(userId)) return;
	seeded.add(userId);
	if (settingsStore.readSettings()) return;
	const raw = process.env.KAPANY_DEFAULT_MODELS;
	if (!raw) return;
	try {
		const models = JSON.parse(raw) as unknown;
		if (models && typeof models === "object") settingsStore.writeSettings({ version: CURRENT_SETTINGS_VERSION, models });
	} catch (err) {
		console.error("[hosted] KAPANY_DEFAULT_MODELS is not valid JSON:", err);
	}
}
