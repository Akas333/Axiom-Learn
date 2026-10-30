import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMetaAsrRelay, metaAsrHandshake, META_ASR_MODEL, META_ASR_URL } from "@axiom/engine/src/server/meta-asr.ts";

/** A scripted stand-in for Meta's realtime socket. */
class FakeUpstream extends EventTarget {
	readyState: number = WebSocket.CONNECTING;
	binaryType = "blob";
	sent: (string | ArrayBuffer | Uint8Array)[] = [];
	closedWith: number | null = null;
	constructor(public url: string) {
		super();
	}
	send(data: string | ArrayBuffer | Uint8Array) {
		this.sent.push(data);
	}
	close(code = 1000) {
		this.closedWith = code;
		this.readyState = WebSocket.CLOSED;
	}
	// test drivers
	open() {
		this.readyState = WebSocket.OPEN;
		this.dispatchEvent(new Event("open"));
	}
	receive(msg: object) {
		this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(msg) }));
	}
	closeFromServer(code: number, reason = "") {
		this.readyState = WebSocket.CLOSED;
		this.dispatchEvent(Object.assign(new Event("close"), { code, reason }));
	}
}

function setup() {
	const toClient: string[] = [];
	const clientClose: { code?: number; reason?: string } = {};
	let upstream!: FakeUpstream;
	const relay = createMetaAsrRelay(
		{ send: (d) => void toClient.push(String(d)), close: (code, reason) => Object.assign(clientClose, { code, reason }) },
		"test-key-not-real",
		(url) => (upstream = new FakeUpstream(url)) as unknown as WebSocket,
	);
	return { relay, upstream, toClient, clientClose };
}

describe("Meta dictation relay", () => {
	it("connects to Meta and authenticates in the handshake, not the URL", () => {
		const { upstream } = setup();
		assert.equal(upstream.url, META_ASR_URL);
		upstream.open();
		assert.deepEqual(JSON.parse(upstream.sent[0] as string), metaAsrHandshake("test-key-not-real"));
		const hs = metaAsrHandshake("k");
		assert.equal(hs.authorization.accessToken, "Bearer k");
		assert.equal(hs.audioEncoding, "PCM_16KHZ");
		assert.equal(hs.mode, "ENDPOINTING");
		assert.equal(hs.model, META_ASR_MODEL);
	});

	it("holds audio until Meta acknowledges, then sends it in order", () => {
		const { relay, upstream } = setup();
		relay.fromClient(new Uint8Array([1]));
		upstream.open();
		relay.fromClient(new Uint8Array([2]));
		assert.equal(upstream.sent.length, 1, "only the handshake before the ack");
		upstream.receive({ sessionId: "s1" });
		relay.fromClient(new Uint8Array([3]));
		assert.deepEqual(upstream.sent.slice(1).map((f) => (f as Uint8Array)[0]), [1, 2, 3]);
	});

	it("forwards Meta's events to the browser and passes endStream through", () => {
		const { relay, upstream, toClient } = setup();
		upstream.open();
		upstream.receive({ sessionId: "s1" });
		upstream.receive({ type: "speechComplete", turnId: 0, transcript: "Why does the moon cause tides?" });
		relay.fromClient(JSON.stringify({ type: "endStream" }));
		assert.equal(JSON.parse(toClient[1]!).transcript, "Why does the moon cause tides?");
		assert.deepEqual(JSON.parse(upstream.sent.at(-1) as string), { type: "endStream" });
	});

	it("closes the browser socket with 1000 when Meta finishes normally", () => {
		const { upstream, clientClose } = setup();
		upstream.open();
		upstream.closeFromServer(1000, "No more transcript segments");
		assert.equal(clientClose.code, 1000);
	});

	it("maps unsendable upstream close codes to 1011", () => {
		const { upstream, clientClose } = setup();
		upstream.closeFromServer(1006);
		assert.equal(clientClose.code, 1011);
	});

	it("ends the Meta session when the browser disconnects", () => {
		const { relay, upstream } = setup();
		upstream.open();
		relay.clientClosed();
		assert.equal(upstream.closedWith, 1000);
		relay.fromClient(new Uint8Array([9]));
		assert.equal(upstream.sent.length, 1, "nothing is sent after the browser left");
	});
});
