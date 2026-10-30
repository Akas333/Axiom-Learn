import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buttonKeepsNativeEnter, ownsEnter } from "@/components/enter-submits";

/** A focused element, as far as ownsEnter looks at it. */
function focused(tagName: string, opts: { type?: string; inOverlay?: boolean } = {}): KeyboardEvent {
	const target = {
		tagName,
		type: opts.type,
		isContentEditable: false,
		closest: () => (opts.inOverlay ? {} : null),
	};
	return { key: "Enter", target } as unknown as KeyboardEvent;
}

describe("which focused element keeps its own Enter", () => {
	it("lets Enter submit from the confidence slider", () => {
		assert.equal(ownsEnter(focused("INPUT", { type: "range" })), false);
	});
	it("leaves a slider inside an open overlay alone", () => {
		assert.equal(ownsEnter(focused("INPUT", { type: "range", inOverlay: true })), true);
	});
	it("keeps Enter for fields you type into", () => {
		assert.equal(ownsEnter(focused("INPUT", { type: "text" })), true);
		assert.equal(ownsEnter(focused("TEXTAREA")), true);
		assert.equal(ownsEnter(focused("SELECT")), true);
	});
	it("lets Enter submit from the page itself", () => {
		assert.equal(ownsEnter(focused("BODY")), false);
	});
});

describe("which focused button keeps its own Enter", () => {
	const button = (inOverlay = false) => ({ closest: () => (inOverlay ? {} : null) }) as unknown as HTMLElement;
	it("lets Enter submit after a mouse click on an answer", () => {
		assert.equal(buttonKeepsNativeEnter(button(), false), false);
	});
	it("keeps Enter on a button reached by keyboard", () => {
		assert.equal(buttonKeepsNativeEnter(button(), true), true);
	});
	it("keeps Enter inside an open overlay", () => {
		assert.equal(buttonKeepsNativeEnter(button(true), false), true);
	});
});
