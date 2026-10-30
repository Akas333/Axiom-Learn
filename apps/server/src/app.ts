import { Hono } from "hono";
import { API_ROUTES, type ApiRoute, type HttpMethod } from "@axiom/engine/src/http/index.ts";

/**
 * The Hono app: mounts every engine API route. Handlers are the engine's own
 * (packages/engine/src/http), so this file only adapts Hono's request and
 * params to the `(Request, { params })` shape they expect.
 */
export function createApp(routes: readonly ApiRoute[] = API_ROUTES): Hono {
	const app = new Hono();

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
