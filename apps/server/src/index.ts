// Must load first: hosted mode moves platform keys out of process.env
// before any engine module can read them.
import { hosted } from "./boot.ts";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { mountDictation } from "./dictation.ts";
import { authConfigFromEnv, supabaseVerifier } from "./auth.ts";
import { billingConfigFromEnv } from "./billing.ts";
import { API_ROUTES } from "@axiom/engine/src/http/index.ts";

const port = Number(process.env.PORT ?? 8787);
// Loopback by default: the API holds keys and spends credits. Set HOST=0.0.0.0
// only behind the hosted deployment's own access control.
const hostname = process.env.HOST ?? "127.0.0.1";

function hostedOptions() {
	const auth = authConfigFromEnv();
	return {
		auth,
		verify: supabaseVerifier(auth),
		billing: billingConfigFromEnv(),
		webDir: process.env.KAPANY_WEB_DIR ?? fileURLToPath(new URL("../../web/dist", import.meta.url)),
	};
}

const app = createApp(API_ROUTES, hosted ? hostedOptions() : undefined);
const injectWebSocket = mountDictation(app);

const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
	console.log(`[axiom-server] listening on http://${info.address}:${info.port}`);
});
injectWebSocket(server);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		server.close(() => process.exit(0));
	});
}
