import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
	appendToDictationTarget,
	ASR_KEYLESS_CLOSE,
	asrUrl,
	ensureAudioGraph,
	registerVoiceFinisher,
	rmsToMeter,
} from "@/components/dictation";

/**
 * HANDS-FREE VOICE THINKING: while a question waits, the mic listens on its
 * own. Speech is transcribed only while the learner talks, and each
 * finished sentence lands straight in whichever thinking field currently
 * owns dictation (the reading field before an option is picked, the answer
 * field after — the claim is decided by the dock, see chat.tsx).
 *
 * How it stays cheap and private: the mic is captured LOCALLY for as long
 * as the question is open (the browser's mic indicator stays on — that is
 * the honest cost of hands-free), but audio only leaves the machine while
 * a voice is detected. A simple level gate on the worklet's per-quantum
 * RMS opens a transcription "segment" (one relay socket = one Meta
 * session) on speech onset, replays ~0.5s of pre-roll so the first word
 * isn't clipped, and ends the segment (endStream → Meta flushes → close
 * 1000) after a short silence. A new onset simply opens a new segment.
 *
 * Same discipline as the manual engine (dictation.tsx): a generation
 * counter makes every async handler of a dead run a no-op; the app-lifetime
 * AudioContext is shared, only per-run nodes are torn down; the submit path
 * awaits in-flight segments through registerVoiceFinisher, so a sentence
 * spoken right before Enter is never lost.
 */

/** Stored on this device; on unless the learner turns it off. */
const PREF_KEY = "lh.voice.handsFree";
const PREF_EVENT = "lh:voice-pref";

/** Voice gate (meter units 0..1 over the −50…−10 dB window). */
const VAD_ON = 0.42; // loud enough to count as speech starting…
const VAD_ONSET_TICKS = 2; // …for this many consecutive 50ms ticks
const VAD_KEEP = 0.28; // anything above this keeps the segment alive
const SILENCE_END_MS = 1200; // quiet this long → end the segment
const TICK_MS = 50;
/** Pre-roll: the last N 128ms frames before onset (~0.5s). */
const PREROLL_FRAMES = 4;
/** A segment that never closes on its own is ended anyway. */
const SEGMENT_SAFETY_MS = 5000;

/** The voice gate's memory between 50ms ticks. */
export type GateState = { open: boolean; onsetTicks: number; lastVoiceAt: number };
export const GATE_START: GateState = { open: false, onsetTicks: 0, lastVoiceAt: 0 };

/**
 * One tick of the voice gate (pure, unit-tested): `level` is the loudest
 * meter value (0..1) since the last tick. Opens after VAD_ONSET_TICKS
 * loud ticks in a row; closes after SILENCE_END_MS without anything above
 * VAD_KEEP. Returns the next state and what to do now.
 */
export function gateStep(
	state: GateState,
	level: number,
	now: number,
): { state: GateState; action: "open" | "end" | null } {
	const lastVoiceAt = level > VAD_KEEP ? now : state.lastVoiceAt;
	if (!state.open) {
		const onsetTicks = level > VAD_ON ? state.onsetTicks + 1 : 0;
		if (onsetTicks >= VAD_ONSET_TICKS) return { state: { open: true, onsetTicks: 0, lastVoiceAt: now }, action: "open" };
		return { state: { open: false, onsetTicks, lastVoiceAt }, action: null };
	}
	if (now - lastVoiceAt > SILENCE_END_MS) return { state: { open: false, onsetTicks: 0, lastVoiceAt }, action: "end" };
	return { state: { open: true, onsetTicks: 0, lastVoiceAt }, action: null };
}

export function readHandsFreePref(): boolean {
	try {
		return localStorage.getItem(PREF_KEY) !== "off";
	} catch {
		return true;
	}
}

export function writeHandsFreePref(on: boolean): void {
	try {
		localStorage.setItem(PREF_KEY, on ? "on" : "off");
	} catch {
		// best-effort: the toggle still applies for this page
	}
	window.dispatchEvent(new CustomEvent(PREF_EVENT, { detail: on }));
}

/** The setting, kept in sync across every mounted reader. */
export function useHandsFreePref(): [boolean, (on: boolean) => void] {
	const [on, setOn] = useState(readHandsFreePref);
	useEffect(() => {
		const sync = () => setOn(readHandsFreePref());
		window.addEventListener(PREF_EVENT, sync);
		window.addEventListener("storage", sync);
		return () => {
			window.removeEventListener(PREF_EVENT, sync);
			window.removeEventListener("storage", sync);
		};
	}, []);
	return [on, writeHandsFreePref];
}

export type VoiceStatus = "starting" | "waiting" | "speaking";

export type VoiceThinking = {
	/** Listening hands-free right now (armed, setting on, not typed-out). */
	listening: boolean;
	status: VoiceStatus;
	/** Latest RMS (0..1) — the listening meter samples it. */
	levelRef: { current: number };
	/** The learner chose "Type instead" for the current question. */
	typedOut: boolean;
	/** "Type instead": stop listening for this question. */
	typeInstead: () => void;
	/** Back to talking after "Type instead". Hidden when voice can't run. */
	listenAgain: () => void;
	/** Voice can't run here (no key / no mic) — fields show plain typing. */
	unavailable: string | null;
};

const VoiceThinkingContext = createContext<VoiceThinking | null>(null);
export const VoiceThinkingProvider = VoiceThinkingContext.Provider;
export function useVoiceThinking(): VoiceThinking | null {
	return useContext(VoiceThinkingContext);
}

type Segment = {
	ws: WebSocket;
	queue: ArrayBuffer[];
	ending: boolean;
	safety: ReturnType<typeof setTimeout> | null;
	done: Promise<void>;
};

/**
 * One instance per chat page. `questionId` arms it (null = no question
 * waiting); `paused` holds it off without forgetting the per-question
 * choice (a manual dictation run owns the mic).
 */
export function useHandsFreeVoice({
	questionId,
	paused,
}: {
	questionId: string | null;
	paused: boolean;
}): VoiceThinking {
	const [prefOn] = useHandsFreePref();
	/** Per-question "Type instead" — a new question starts listening again. */
	const [typedFor, setTypedFor] = useState<string | null>(null);
	const [unavailable, setUnavailable] = useState<string | null>(null);
	const [status, setStatus] = useState<VoiceStatus>("starting");
	const levelRef = useRef(0);

	const listening =
		questionId !== null && prefOn && typedFor !== questionId && unavailable === null && !paused;

	// The engine: runs exactly while `listening` holds.
	useEffect(() => {
		if (!listening) return;
		let alive = true; // the generation guard for this run
		let stream: MediaStream | null = null;
		let source: MediaStreamAudioSourceNode | null = null;
		let worklet: AudioWorkletNode | null = null;
		let current: Segment | null = null;
		const inflight = new Set<Promise<void>>();
		const preroll: ArrayBuffer[] = [];
		let peak = 0; // loudest quantum since the last tick
		let gate: GateState = GATE_START;
		setStatus("starting");

		const fail = (why: string) => {
			if (!alive) return;
			setUnavailable(why);
		};

		const openSegment = () => {
			let resolveDone!: () => void;
			const done = new Promise<void>((r) => (resolveDone = r));
			const ws = new WebSocket(asrUrl());
			ws.binaryType = "arraybuffer";
			const seg: Segment = { ws, queue: [...preroll], ending: false, safety: null, done };
			preroll.length = 0;
			inflight.add(done);
			const finishSeg = () => {
				if (seg.safety) clearTimeout(seg.safety);
				inflight.delete(done);
				resolveDone();
			};
			ws.addEventListener("open", () => {
				for (const frame of seg.queue) ws.send(frame);
				seg.queue = [];
				if (seg.ending) sendEnd(seg);
			});
			ws.addEventListener("message", (ev) => {
				let msg: { type?: string; transcript?: string };
				try {
					msg = JSON.parse(ev.data as string);
				} catch {
					return;
				}
				// Sentences land as they finish — even after this run was
				// torn down (submit awaits them), but never into a stale page:
				// with no claimant the text is simply dropped.
				if (msg.type === "speechComplete" && msg.transcript?.trim()) appendToDictationTarget(msg.transcript.trim());
			});
			ws.addEventListener("close", (ev) => {
				finishSeg();
				if (ev.code === ASR_KEYLESS_CLOSE) fail("Voice needs a Meta key");
			});
			ws.addEventListener("error", () => finishSeg());
			current = seg;
			setStatus("speaking");
		};

		const sendEnd = (seg: Segment) => {
			if (seg.ws.readyState === WebSocket.OPEN) {
				try {
					seg.ws.send(JSON.stringify({ type: "endStream" }));
				} catch {
					seg.ws.close();
				}
			}
			// Meta closes with 1000 once the last sentence is out; if it
			// never does, close it ourselves.
			seg.safety ??= setTimeout(() => {
				try {
					seg.ws.close();
				} catch {}
			}, SEGMENT_SAFETY_MS);
		};

		const endSegment = () => {
			const seg = current;
			if (!seg) return;
			current = null;
			seg.ending = true;
			if (seg.ws.readyState !== WebSocket.CONNECTING) sendEnd(seg);
			if (alive) setStatus("waiting");
		};

		// The gate: every 50ms, look at the loudest quantum since last tick.
		const tick = setInterval(() => {
			const step = gateStep({ ...gate, open: current !== null }, rmsToMeter(peak), performance.now());
			peak = 0;
			gate = step.state;
			if (step.action === "open") openSegment();
			else if (step.action === "end") endSegment();
		}, TICK_MS);

		void (async () => {
			try {
				const s = await navigator.mediaDevices.getUserMedia({
					audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
				});
				if (!alive) {
					for (const t of s.getTracks()) t.stop();
					return;
				}
				stream = s;
				const { ctx, module } = ensureAudioGraph();
				await module;
				if (ctx.state === "suspended") await ctx.resume();
				if (!alive) return;
				worklet = new AudioWorkletNode(ctx, "pcm-capture");
				worklet.port.onmessage = (e) => {
					const msg = e.data as { type: string; rms?: number; buffer?: ArrayBuffer };
					if (msg.type === "level") {
						const rms = msg.rms ?? 0;
						levelRef.current = rms;
						if (rms > peak) peak = rms;
					} else if (msg.type === "audio" && msg.buffer) {
						const seg = current;
						if (seg && !seg.ending) {
							if (seg.ws.readyState === WebSocket.OPEN) seg.ws.send(msg.buffer);
							else seg.queue.push(msg.buffer);
						} else {
							preroll.push(msg.buffer);
							if (preroll.length > PREROLL_FRAMES) preroll.shift();
						}
					}
				};
				source = ctx.createMediaStreamSource(s);
				source.connect(worklet);
				worklet.connect(ctx.destination);
				setStatus("waiting");
			} catch (e) {
				const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
				fail(denied ? "Microphone permission denied" : "Microphone unavailable");
			}
		})();

		// Submit seam: end the live segment and wait for every in-flight
		// sentence (bounded by each segment's safety close).
		registerVoiceFinisher(
			() => {
				endSegment();
				return Promise.all([...inflight]).then(() => undefined);
			},
			() => current !== null || inflight.size > 0,
		);

		return () => {
			alive = false;
			clearInterval(tick);
			// Let the last sentence finish into its field (the claimant may
			// already be gone — then it's dropped, see the message handler).
			endSegment();
			for (const t of stream?.getTracks() ?? []) t.stop();
			source?.disconnect();
			worklet?.disconnect();
			levelRef.current = 0;
			// Keep the finisher until in-flight segments settle, so a submit
			// that raced the teardown still waits for them.
			const settled = Promise.all([...inflight]);
			registerVoiceFinisher(
				() => settled.then(() => undefined),
				() => inflight.size > 0,
			);
			void settled.then(() => registerVoiceFinisher(null));
		};
	}, [listening]);

	// A fresh question clears a "voice unavailable" from a transient mic
	// error, but not a missing key (that needs Settings, not a retry).
	useEffect(() => {
		setUnavailable((u) => (u === "Voice needs a Meta key" ? u : null));
	}, [questionId]);

	const typeInstead = useCallback(() => setTypedFor(questionId), [questionId]);
	const listenAgain = useCallback(() => {
		setTypedFor(null);
		setUnavailable(null);
	}, []);

	return {
		listening,
		typedOut: questionId !== null && typedFor === questionId,
		status: listening ? status : "waiting",
		levelRef,
		typeInstead,
		listenAgain,
		unavailable,
	};
}
