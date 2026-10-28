import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { mountDictation } from "./dictation.ts";
import { ensureAnkiAutoSync } from "@axiom/engine/src/server/anki.ts";

const port = Number(process.env.PORT ?? 8787);
// Loopback by default: the API holds keys and spends credits. Set HOST=0.0.0.0
// only behind the hosted deployment's own access control.
const hostname = process.env.HOST ?? "127.0.0.1";
const loopback = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
if (!loopback && !process.env.AXIOM_ACCESS_TOKEN) {
	console.error("[axiom-server] refusing to listen on a public address without AXIOM_ACCESS_TOKEN set.");
	process.exit(1);
}

const app = createApp();
const injectWebSocket = mountDictation(app);

const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
	console.log(`[axiom-server] listening on http://${info.address}:${info.port}`);
});
injectWebSocket(server);
// Keep the Anki deck in step after sessions (no-op until enabled in Settings).
ensureAnkiAutoSync();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		server.close(() => process.exit(0));
	});
}
