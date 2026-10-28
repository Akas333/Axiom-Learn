import { Hono } from "hono";
import { cors } from "hono/cors";
import { corsOrigins, hostedAccessAllowed } from "./access.ts";
import { API_ROUTES, type ApiRoute, type HttpMethod } from "@axiom/engine/src/http/index.ts";
import { desktopAPIAuthorized } from "@axiom/engine/src/server/desktop-access.ts";

/**
 * The Hono app: mounts every engine API route. Handlers are the engine's own
 * (packages/engine/src/http), so this file only adapts Hono's request and
 * params to the `(Request, { params })` shape they expect.
 */
export function createApp(routes: readonly ApiRoute[] = API_ROUTES): Hono {
	const app = new Hono();

	// Liveness for the hosting platform (no secrets, no engine work).
	app.get("/health", (c) => c.json({ ok: true }));

	// A browser front end on another origin (hosted web) needs CORS; native
	// clients (the Expo app) don't. Off unless origins are listed.
	const origins = corsOrigins();
	if (origins.length > 0) {
		app.use("/api/*", cors({ origin: origins, allowHeaders: ["Authorization", "Content-Type"], credentials: false }));
	}

	// Hosted deployment: the shared access token (see access.ts). Runs before
	// the desktop gate so an unauthenticated caller learns nothing more.
	app.use("/api/*", async (c, next) => {
		if (!hostedAccessAllowed(c.req.raw.headers, c.req.url)) {
			return c.json({ error: "Missing or wrong access token." }, 401, { "Cache-Control": "no-store" });
		}
		await next();
	});

	// Same gate the legacy Next app applies (proxy.ts): open in plain dev,
	// locked to the desktop window's secret when running as the desktop server.
	app.use("/api/*", async (c, next) => {
		if (!desktopAPIAuthorized(c.req.raw.headers)) {
			return c.json(
				{ error: "Desktop API access requires the trusted Kapany window." },
				403,
				{ "Cache-Control": "no-store" },
			);
		}
		await next();
	});

	for (const route of routes) {
		for (const [method, handler] of Object.entries(route.handlers) as [HttpMethod, NonNullable<ApiRoute["handlers"][HttpMethod]>][]) {
			app.on(method, route.path, (c) => {
				const params: Record<string, string | string[]> = { ...c.req.param() };
				if (route.catchAll) params[route.catchAll] = catchAllSegments(route.path, new URL(c.req.url).pathname);
				return handler(c.req.raw, { params: Promise.resolve(params) });
			});
		}
	}

	app.notFound((c) => c.json({ error: "Not found" }, 404));
	return app;
}

/** The path segments a trailing `*` matched, still URL-encoded as Next passes them
 *  (c.req.path is already decoded, so read the raw URL). */
function catchAllSegments(pattern: string, path: string): string[] {
	const prefixSegments = pattern.split("/").filter(Boolean).length - 1;
	return path.split("/").filter(Boolean).slice(prefixSegments);
}
