import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

/** The built web app (npm run build -w @axiom/web). The desktop app ships
 *  it elsewhere and points KAPANY_WEB_DIR at it. */
export const WEB_DIST = process.env.KAPANY_WEB_DIR ?? fileURLToPath(new URL("../../web/dist", import.meta.url));

/**
 * Serves the built web app from this server, so one process on one address
 * runs all of Kapany (npm start and the desktop app set KAPANY_SERVE_WEB=1). Unknown
 * non-API paths get index.html, where React Router takes over.
 */
export function mountWeb(app: Hono, dist = WEB_DIST): boolean {
	const index = path.join(dist, "index.html");
	if (!existsSync(index)) return false;
	// serveStatic's root is relative to the working directory.
	const root = path.relative(process.cwd(), dist) || ".";
	app.use("*", async (c, next) => {
		if (c.req.path.startsWith("/api/")) return next();
		return serveStatic({ root })(c, next);
	});
	app.get("*", async (c, next) => {
		if (c.req.path.startsWith("/api/")) return next();
		return c.html(await readFile(index, "utf8"));
	});
	return true;
}
