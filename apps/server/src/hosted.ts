import fs from "node:fs";
import path from "node:path";
import type { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { quotaStatus, recordPlatformTurn, userHasOwnProviderKey } from "@axiom/engine/src/server/hosted.ts";
import { currentTenant } from "@axiom/engine/tenant.ts";
import { mountAuthRoutes, requireUser, sessionToken, type AuthConfig, type TokenVerifier } from "./auth.ts";
import { mountBillingApi, mountBillingWebhook, planSink, type BillingConfig } from "./billing.ts";
import { fetchProfile, mirrorPlan, mountProfileRoutes } from "./profiles.ts";

export interface HostedOptions {
	auth: AuthConfig;
	verify: TokenVerifier;
	billing: BillingConfig | null;
	/** Built web app (apps/web/dist) to serve at /, or undefined for API only. */
	webDir?: string;
}

/** Desktop-only features with no meaning on a shared server: Anki talks to
 *  the user's own machine, subscription logins open local browser windows. */
const DESKTOP_ONLY = [/^\/api\/anki(\/|$)/, /^\/api\/subscriptions(\/|$)/];

/**
 * Mount hosted mode on `app`: public auth + webhook routes, then the
 * signed-in /api/* gate, account and billing endpoints, the free-tier quota.
 * Returns a function to call after the engine routes are mounted (it adds
 * the web app's static files and the client-side routing fallback).
 */
export function mountHosted(app: Hono, options: HostedOptions): () => void {
	mountAuthRoutes(app, options.auth, options.verify);
	mountBillingWebhook(app, options.billing, planSink(options.auth));
	app.get("/healthz", (c) => c.text("ok"));

	app.use("/api/*", requireUser(options.auth, options.verify));

	app.use("/api/*", async (c, next) => {
		if (DESKTOP_ONLY.some((re) => re.test(c.req.path))) {
			return c.json({ error: "Not available in the hosted app" }, 404);
		}
		await next();
	});

	app.get("/api/me", async (c) => {
		const tenant = currentTenant()!;
		const token = sessionToken(c);
		// The profile row is the durable plan record; mirror it before quoting the quota.
		const profile = token ? await fetchProfile(options.auth, token, tenant.userId).catch(() => null) : null;
		if (profile) mirrorPlan(profile);
		return c.json({ userId: tenant.userId, email: tenant.email ?? null, profile, quota: quotaStatus(), billing: options.billing !== null });
	});
	mountProfileRoutes(app, options.auth, sessionToken);
	mountBillingApi(app, options.billing);

	// Free/paid plan quota: teaching turns on platform keys are metered.
	app.use("/api/chat", async (c, next) => {
		if (c.req.method !== "POST" || userHasOwnProviderKey()) return next();
		const quota = quotaStatus();
		if (quota.remaining <= 0) {
			return c.json(
				{
					error: `You've used this month's ${quota.limit} lessons on the ${quota.plan} plan. Upgrade, or add your own API key in Settings → Keys.`,
					code: "quota_exceeded",
					quota,
				},
				402,
			);
		}
		await next();
		if (c.res.ok) recordPlatformTurn();
	});

	return () => {
		const webDir = options.webDir;
		if (!webDir || !fs.existsSync(path.join(webDir, "index.html"))) return;
		const index = fs.readFileSync(path.join(webDir, "index.html"), "utf-8");
		app.use("/*", serveStatic({ root: webDir }));
		// Client-side routes (/chat/:id, …) all load the app shell.
		app.get("*", (c) => (c.req.path.startsWith("/api/") ? c.json({ error: "Not found" }, 404) : c.html(index)));
	};
}
