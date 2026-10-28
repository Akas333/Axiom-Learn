// Web globals the shared session code (apps/web/components/session-core.ts)
// uses that Hermes may not provide.
import * as ExpoCrypto from "expo-crypto";

const g = globalThis as unknown as Record<string, unknown>;

// The engine core mints message ids with crypto.randomUUID().
const existing = g.crypto as { randomUUID?: unknown; getRandomValues?: unknown } | undefined;
if (typeof existing?.randomUUID !== "function") {
	g.crypto = {
		...(existing ?? {}),
		randomUUID: () => ExpoCrypto.randomUUID(),
		getRandomValues: existing?.getRandomValues ?? (<T extends ArrayBufferView>(a: T) => ExpoCrypto.getRandomValues(a as never) as T),
	};
}

if (typeof g.DOMException === "undefined") {
	class DOMExceptionShim extends Error {
		constructor(message?: string, name = "Error") {
			super(message);
			this.name = name;
		}
	}
	g.DOMException = DOMExceptionShim;
}

const arrayProto = Array.prototype as unknown as Record<string, unknown>;
if (typeof arrayProto.with !== "function") {
	Object.defineProperty(Array.prototype, "with", {
		configurable: true,
		writable: true,
		value: function <T>(this: T[], index: number, value: T): T[] {
			const copy = this.slice();
			const i = index < 0 ? copy.length + index : index;
			if (i < 0 || i >= copy.length) throw new RangeError("Invalid index");
			copy[i] = value;
			return copy;
		},
	});
}

export {};
