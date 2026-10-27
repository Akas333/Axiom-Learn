import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { mountDictation } from "./dictation.ts";
import { ensureAnkiAutoSync } from "@axiom/engine/src/server/anki.ts";

const port = Number(process.env.PORT ?? 8787);
// Loopback by default: the API holds keys and spends credits. Set HOST=0.0.0.0
// only behind the hosted deployment's own access control.
const hostname = process.env.HOST ?? "127.0.0.1";

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
