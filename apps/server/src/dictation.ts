import { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import type { WSContext } from "hono/ws";
import {
	ASR_KEYLESS_CLOSE,
	createMetaAsrRelay,
	metaAsrKey,
	type MetaAsrRelay,
} from "@axiom/engine/src/server/meta-asr.ts";
import { currentTenant, runAsTenant } from "@axiom/engine/tenant.ts";

/**
 * GET /api/stt/realtime (WebSocket): browser dictation relayed to Meta
 * Muse Voice Transcribe. The browser sends PCM frames and `endStream`;
 * it receives Meta's events (`transcript`, `speechComplete`, …) as-is.
 * Returns the hook that attaches WebSocket upgrades to the Node server.
 */
export function mountDictation(app: Hono) {
	const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

	app.get(
		"/api/stt/realtime",
		upgradeWebSocket(() => {
			let relay: MetaAsrRelay | null = null;
			// Socket events fire outside the request, so carry the signed-in
			// user (hosted mode) into them explicitly for the key lookup.
			const tenant = currentTenant();
			const open = (ws: WSContext) => {
				const key = metaAsrKey();
				if (!key) {
					ws.close(ASR_KEYLESS_CLOSE, "Dictation needs a Meta key");
					return;
				}
				relay = createMetaAsrRelay(
					{ send: (data) => ws.send(data as string | ArrayBuffer), close: (code, reason) => ws.close(code, reason) },
					key,
				);
			};
			return {
				onOpen(_event, ws) {
					if (tenant) runAsTenant(tenant, () => open(ws));
					else open(ws);
				},
				onMessage(event) {
					relay?.fromClient(event.data as string | ArrayBuffer);
				},
				onClose() {
					relay?.clientClosed();
				},
			};
		}),
	);

	return injectWebSocket;
}
