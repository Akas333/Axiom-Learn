import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { mountDictation } from "./dictation.ts";
import { mountWeb } from "./web.ts";
import { API_ROUTES } from "@axiom/engine/src/http/index.ts";

const port = Number(process.env.PORT ?? 8787);
// Loopback only by default: the API holds keys and spends credits, and
// everything stays on this computer.
const hostname = process.env.HOST ?? "127.0.0.1";

const app = createApp(API_ROUTES);
const injectWebSocket = mountDictation(app);
// The launcher (npm start) serves the web app from here too: one address.
if (process.env.KAPANY_SERVE_WEB === "1" && !mountWeb(app)) {
	console.warn("[axiom-server] KAPANY_SERVE_WEB=1 but apps/web/dist is missing; run npm run build -w @axiom/web");
}

const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
	console.log(`[axiom-server] listening on http://${info.address}:${info.port}`);
});
injectWebSocket(server);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		server.close(() => process.exit(0));
	});
}
