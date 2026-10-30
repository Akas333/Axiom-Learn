/**
 * Meta Muse Voice Transcribe (realtime speech-to-text) for dictation.
 *
 * The browser streams 16 kHz mono PCM to our server; the server opens
 * Meta's realtime socket, authenticates in the handshake frame with the
 * saved META_API_KEY (Meta has no browser-safe tokens, so the key never
 * leaves the server), and relays both directions.
 *
 * Wire protocol (dev.meta.ai/docs/speech-to-text):
 * - first text frame: the handshake; the server answers `{ sessionId }`
 * - then binary PCM frames, paced in real time (the capture worklet is)
 * - client ends input with `{ "type": "endStream" }`; the server flushes
 *   the last turns and closes with 1000
 * - ENDPOINTING mode: one `speechComplete` event per utterance
 */
import { keyValue } from "./keys.ts";

export const META_ASR_URL = "wss://api.meta.ai/v1/asr/realtime";
export const META_ASR_MODEL = "muse-voice-transcribe-1.0";
export const META_KEY_ID = "META_API_KEY";

/** Close code we send the browser when no Meta key is saved. */
export const ASR_KEYLESS_CLOSE = 4401;

export interface MetaAsrHandshake {
	authorization: { accessToken: string };
	audioEncoding: "PCM_16KHZ";
	model: string;
	mode: "ENDPOINTING";
	partialMode: "CUMULATIVE";
	emitAudioProgress: false;
}

export function metaAsrHandshake(apiKey: string): MetaAsrHandshake {
	return {
		authorization: { accessToken: `Bearer ${apiKey}` },
		audioEncoding: "PCM_16KHZ",
		model: META_ASR_MODEL,
		mode: "ENDPOINTING",
		partialMode: "CUMULATIVE",
		emitAudioProgress: false,
	};
}

/** The saved Meta key, or undefined (dictation then reports it's missing). */
export function metaAsrKey(): string | undefined {
	return keyValue(META_KEY_ID);
}

/** The minimal socket surface the relay needs (browser and upstream). */
export interface RelaySocket {
	send(data: string | ArrayBuffer | Uint8Array): void;
	close(code?: number, reason?: string): void;
}

export interface MetaAsrRelay {
	/** A frame from the browser: binary audio, or a JSON control message. */
	fromClient(data: string | ArrayBuffer | Uint8Array): void;
	/** The browser went away: end the upstream session. */
	clientClosed(): void;
}

/**
 * Relay one browser dictation socket to Meta. Audio that arrives before
 * Meta acknowledges the handshake is queued and flushed in order after it.
 * `openUpstream` is injectable for tests.
 */
export function createMetaAsrRelay(
	client: RelaySocket,
	apiKey: string,
	openUpstream: (url: string) => WebSocket = (url) => new WebSocket(url),
): MetaAsrRelay {
	const upstream = openUpstream(META_ASR_URL);
	upstream.binaryType = "arraybuffer";
	const queued: (string | ArrayBuffer | Uint8Array)[] = [];
	let ready = false;
	let done = false;

	const finish = (code: number, reason: string) => {
		if (done) return;
		done = true;
		try {
			client.close(code, reason);
		} catch {}
	};

	upstream.addEventListener("open", () => upstream.send(JSON.stringify(metaAsrHandshake(apiKey))));
	upstream.addEventListener("message", (ev) => {
		const text = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);
		if (!ready) {
			// The acknowledgement is the only frame without a `type`.
			const msg = JSON.parse(text) as { sessionId?: string; type?: string };
			if (msg.sessionId && !msg.type) {
				ready = true;
				for (const frame of queued.splice(0)) upstream.send(frame);
			}
		}
		try {
			client.send(text);
		} catch {}
	});
	upstream.addEventListener("close", (ev) => {
		// 1000 = normal end after endStream; other codes pass through so the
		// browser can decide whether to retry (1005/1006 are not sendable).
		const code = ev.code === 1000 || (ev.code >= 3000 && ev.code < 5000) ? ev.code : 1011;
		finish(code, ev.reason || "upstream closed");
	});
	upstream.addEventListener("error", () => finish(1011, "Meta transcription unreachable"));

	return {
		fromClient(data) {
			if (done) return;
			if (ready && upstream.readyState === WebSocket.OPEN) upstream.send(data);
			else if (queued.length < 512) queued.push(data);
		},
		clientClosed() {
			done = true;
			if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
				try {
					upstream.close(1000, "client closed");
				} catch {}
			}
		},
	};
}
