import fs from "node:fs";
import path from "node:path";
import type { Context, Hono, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { PATHS } from "@axiom/engine/config.ts";
import { runAsTenant, type Tenant } from "@axiom/engine/tenant.ts";
import { seedNewUser } from "@axiom/engine/src/server/hosted.ts";

/**
 * Hosted sign-in (Supabase Auth).
 *
 * The browser signs in with supabase-js, then POSTs its access token to
 * /auth/session. The server verifies it and stores it in an HttpOnly cookie,
 * so every existing fetch, EventSource and WebSocket in the web app is
 * authenticated with no per-call changes. The client re-posts on every token
 * refresh. Cookie auth is guarded against cross-site use by SameSite=Lax plus
 * an Origin check on every non-GET request and every WebSocket upgrade.
 */

export const SESSION_COOKIE = "kapany_session";

export interface AuthConfig {
	supabaseUrl: string;
	supabaseAnonKey: string;
	/** Legacy HS256 projects only; newer projects sign with keys from JWKS. */
	jwtSecret?: string;
	/** Server-only key (service_role or sb_secret_…): writes plan fields. */
	serviceKey?: string;
	/** Allowed browser origins (comma-separated KAPANY_ORIGINS); empty = same host. */
	origins: string[];
}

export function authConfigFromEnv(env = process.env): AuthConfig {
	const supabaseUrl = env.SUPABASE_URL?.replace(/\/+$/, "");
	const supabaseAnonKey = env.SUPABASE_ANON_KEY;
	if (!supabaseUrl || !supabaseAnonKey) {
		throw new Error("Hosted mode needs SUPABASE_URL and SUPABASE_ANON_KEY");
	}
	return {
		supabaseUrl,
		supabaseAnonKey,
		jwtSecret: env.SUPABASE_JWT_SECRET || undefined,
		serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || undefined,
		origins: (env.KAPANY_ORIGINS ?? "").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean),
	};
}

export type TokenVerifier = (token: string) => Promise<Tenant | null>;

export function supabaseVerifier(config: AuthConfig): TokenVerifier {
	const issuer = `${config.supabaseUrl}/auth/v1`;
	const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
	const secret = config.jwtSecret ? new TextEncoder().encode(config.jwtSecret) : undefined;
	return async (token) => {
		try {
			const options = { issuer, audience: "authenticated" };
			const { payload } = secret ? await jwtVerify(token, secret, options) : await jwtVerify(token, jwks, options);
			return tenantFrom(payload);
		} catch {
			return null;
		}
	};
}

function tenantFrom(payload: JWTPayload): Tenant | null {
	if (typeof payload.sub !== "string") return null;
	const email = typeof payload.email === "string" ? payload.email : undefined;
	return { userId: payload.sub, email };
}

/** The signed-in user's access token on this request (header or cookie). */
export function sessionToken(c: Context): string | undefined {
	return bearer(c) ?? getCookie(c, SESSION_COOKIE);
}

function bearer(c: Context): string | undefined {
	const header = c.req.header("authorization");
	return header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
}

/** Is this request from our own site? Browsers always send Origin on
 *  cross-site writes and WebSocket upgrades. */
export function sameOrigin(c: Context, config: AuthConfig): boolean {
	const origin = c.req.header("origin");
	if (!origin) return true; // non-browser client: no ambient cookie risk
	const normalized = origin.replace(/\/+$/, "");
	if (config.origins.includes(normalized)) return true;
	const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
	try {
		return new URL(normalized).host === host;
	} catch {
		return false;
	}
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** /api/*: require a signed-in user and run the request as them. */
export function requireUser(config: AuthConfig, verify: TokenVerifier): MiddlewareHandler {
	return async (c, next) => {
		const isUpgrade = c.req.header("upgrade")?.toLowerCase() === "websocket";
		if ((!SAFE_METHODS.has(c.req.method) || isUpgrade) && !sameOrigin(c, config)) {
			return c.json({ error: "Cross-site request refused" }, 403);
		}
		const token = sessionToken(c);
		const tenant = token ? await verify(token) : null;
		if (!tenant) return c.json({ error: "Sign in required", code: "auth_required" }, 401);
		return runAsTenant(tenant, async () => {
			c.set("tenant" as never, tenant as never);
			seedNewUser();
			const guard = chatOwnershipGuard(c.req.path);
			if (guard) return guard;
			await next();
		});
	};
}

/** Chat routes key live state by chat id: refuse ids the user doesn't own
 *  before any handler looks one up. */
function chatOwnershipGuard(requestPath: string): Response | null {
	const match = /^\/api\/chats\/([^/]+)/.exec(requestPath);
	if (!match) return null;
	const id = decodeURIComponent(match[1]!);
	if (!/^[\w-]+$/.test(id) || !fs.existsSync(path.join(PATHS.chats, `${id}.json`))) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}
	return null;
}

/** /auth/*: the session cookie endpoints and the public client config. */
export function mountAuthRoutes(app: Hono, config: AuthConfig, verify: TokenVerifier): void {
	app.get("/auth/config", (c) =>
		c.json({ supabaseUrl: config.supabaseUrl, supabaseAnonKey: config.supabaseAnonKey }, 200, { "Cache-Control": "no-store" }),
	);

	app.post("/auth/session", async (c) => {
		if (!sameOrigin(c, config)) return c.json({ error: "Cross-site request refused" }, 403);
		const token = bearer(c);
		const tenant = token ? await verify(token) : null;
		if (!token || !tenant) return c.json({ error: "Invalid session" }, 401);
		setCookie(c, SESSION_COOKIE, token, {
			httpOnly: true,
			secure: new URL(c.req.url).protocol === "https:" || c.req.header("x-forwarded-proto") === "https",
			sameSite: "Lax",
			path: "/",
			maxAge: 60 * 60 * 24 * 7,
		});
		return c.json({ userId: tenant.userId, email: tenant.email ?? null });
	});

	app.post("/auth/logout", (c) => {
		if (!sameOrigin(c, config)) return c.json({ error: "Cross-site request refused" }, 403);
		deleteCookie(c, SESSION_COOKIE, { path: "/" });
		return c.json({ ok: true });
	});
}
