/**
 * MATERIALS (2026-10-29): the marker text (inline when short, contents
 * when long, a status line while transcribing), slicing by pages and
 * headings, the extractor's KaTeX check and re-read (scripted vision
 * model), attaching to a chat, the per-turn refresh that carries the
 * learner's corrections, and the two reader tools.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";

import {
	materialContents,
	materialMarkerText,
	materialSlice,
	MATERIAL_INLINE_CHARS,
	type MaterialRecord,
} from "../src/core/contracts/materials.ts";
import { extractMaterial, mathParses } from "../src/agent/subagents/material-extractor.ts";
import { materialTools } from "../src/agent/tools/materials.ts";
import type { PiEngine } from "../src/agent/models.ts";

const BOOK = [
	"<!-- page 1 -->",
	"## 4.4 Ampère's law",
	"The line integral of $\\vec B$ around a closed path:",
	"$$",
	"\\oint_M \\vec B\\cdot d\\vec l = \\mu_0 I_{\\text{enclosed}} \\tag{4.53}",
	"$$",
	"<!-- page 2 -->",
	"### Illustration 4.16",
	"A coaxial cable with inner radius $a$ and shell radii $b$, $c$.",
].join("\n");

function record(over: Partial<MaterialRecord> = {}): MaterialRecord {
	return { id: "mat_test_abc12345", name: "chapter4.pdf", mime: "application/pdf", status: "ready", markdown: BOOK, createdAt: "2026-10-29T00:00:00Z", pageCount: 2, ...over };
}

/** A vision model that answers each call with the next scripted text. */
function scriptedEngine(replies: string[]): PiEngine & { calls: number } {
	const engine = {
		calls: 0,
		level: undefined,
		model: { api: "faux", provider: "faux", id: "vision", contextWindow: 8192 } as never,
		streamFn: (() => {
			const text = replies[Math.min(engine.calls, replies.length - 1)]!;
			engine.calls++;
			return (async function* () {
				yield { type: "done", message: { role: "assistant", content: [{ type: "text", text }] } };
			})();
		}) as never,
	};
	return engine as never;
}

describe("material text", () => {
	it("rides inline when short, as contents when long, as a status line while transcribing", () => {
		assert.match(materialMarkerText(record()), /\\tag\{4\.53\}/);
		const long = record({ markdown: `${BOOK}\n${"x".repeat(MATERIAL_INLINE_CHARS)}` });
		const text = materialMarkerText(long);
		assert.doesNotMatch(text, /\\tag/);
		assert.match(text, /Contents:\n- ## 4.4 Ampère's law \(p\. 1\)\n- ### Illustration 4\.16 \(p\. 2\)/);
		assert.match(materialMarkerText(record({ status: "extracting", pagesDone: 1 })), /still being transcribed \(1\/2 pages\)/);
		assert.match(materialMarkerText(record({ editedAt: "now" })), /corrected by the learner/);
	});

	it("slices by page range and by heading", () => {
		assert.match(materialSlice(BOOK, { pages: "2" }), /^<!-- page 2 -->\n### Illustration 4\.16/);
		assert.doesNotMatch(materialSlice(BOOK, { pages: "2" }), /Ampère/);
		assert.match(materialSlice(BOOK, { heading: "illustration 4.16" }), /coaxial cable/);
		assert.equal(materialContents(BOOK).length, 2);
	});
});

describe("the extractor", () => {
	it("knows when math fails KaTeX", () => {
		assert.equal(mathParses("$$\n\\oint_M \\vec B\\cdot d\\vec l = \\mu_0 I \\tag{4.53}\n$$"), true);
		assert.equal(mathParses("$$\\oint_M \\vec B\\cdot d\\vec l = \\mu_0 I \\tag{4.53}$$"), false, "one-line $$ is inline math: no tag");
		assert.equal(mathParses("$\\frac{1}{$ broken"), false);
	});

	it("re-reads an image whose math does not parse", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axiom-material-"));
		const file = path.join(dir, "page.png");
		fs.writeFileSync(file, Buffer.from("not really a png"));
		const engine = scriptedEngine(["$$\\frac{\\mu_0 I}{2\\pi r$$", "$$\\frac{\\mu_0 I}{2\\pi r}$$"]);
		const out = await extractMaterial(file, "image/png", { engine });
		assert.equal(engine.calls, 2, "the broken transcription was read again");
		assert.equal(out.markdown, "$$\\frac{\\mu_0 I}{2\\pi r}$$");
		assert.equal(out.pageCount, 1);
	});
});

describe("attaching and refreshing", () => {
	it("attach marks the chat; the marker the agent reads carries the learner's correction", async () => {
		const { stores, attachMaterial, refreshMaterialMarkers } = await import("../src/server/index.ts");
		const chat = stores.chatStore.createChat("Ampère's law");
		const material = attachMaterial({ name: "page.png", mime: "image/png", bytes: new Uint8Array([1, 2, 3]), chatId: chat.id });
		const marker = stores.chatStore.getChat(chat.id)!.messages.at(-1) as { customType?: string };
		assert.equal(marker.customType, "material");

		stores.materialStore.updateMaterial(material.id, { status: "ready", markdown: "$B = \\mu_0 n I$", editedAt: "now" });
		const [refreshed] = refreshMaterialMarkers(stores.chatStore.getChat(chat.id)!.messages) as Array<{ content: string }>;
		assert.match(refreshed!.content, /\$B = \\mu_0 n I\$/);
		assert.match(refreshed!.content, /corrected by the learner/);
	});

	it("refuses an unsupported file", async () => {
		const { stores, attachMaterial, MaterialError } = await import("../src/server/index.ts");
		const chat = stores.chatStore.createChat("x");
		assert.throws(() => attachMaterial({ name: "a.txt", mime: "text/plain", bytes: new Uint8Array([1]), chatId: chat.id }), MaterialError);
	});
});

describe("material tools", () => {
	const tools = materialTools({ chatId: "c1", readable: () => [record()] });

	it("material_read returns a page or a section", async () => {
		const page = await tools.material_read!.execute("t1", { materialId: "mat_test_abc12345", pages: "1" });
		assert.match(JSON.stringify(page.content), /tag\{4\.53\}/);
		const missing = await tools.material_read!.execute("t2", { materialId: "mat_other_00000000" });
		assert.match(JSON.stringify(missing.content), /no material/);
	});

	it("material_search finds lines with page and section", async () => {
		const res = await tools.material_search!.execute("t1", { query: "coaxial" });
		assert.match(JSON.stringify(res.content), /p\.2 § Illustration 4\.16/);
	});
});
