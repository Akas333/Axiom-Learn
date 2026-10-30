/**
 * The material extractor (2026-10-29): transcribes an attached image or
 * PDF into Markdown the agents can teach from — every page, not a brief
 * (the pdf-reader answers questions; this keeps the whole text).
 *
 * Per page: a text-only page (no images, no math, plenty of text) takes
 * its text layer as is; anything else is rendered (pdfjs + Skia, the same
 * native renderer as the pdf-reader) and read by the vision model. Every
 * transcribed page's math must parse in KaTeX; a page that fails is read
 * again at a higher resolution once — what still fails stays for the
 * learner to correct on the material card.
 */
import * as fs from "node:fs";
import katex from "katex";
import { normalizeContext, type AssistantMessage, type Message } from "@earendil-works/pi-ai";
import type { PiEngine } from "../models.ts";
import { getHeadless, type HeadlessApi } from "./headless.ts";
import { pdfExtract, pdfInfo } from "./pdf-ops.ts";
import { readContentSpans } from "../../core/content-reader.ts";
import { materialPageMark } from "../../core/contracts/materials.ts";

/** Pages beyond this are left out (noted in the transcription). */
export const MATERIAL_MAX_PAGES = 80;

const TRANSCRIBE_PROMPT = `You transcribe study material (textbook pages, coaching notes, problem sheets) into Markdown
for a tutor that will teach from it. Transcribe the page you are shown faithfully and completely.

Rules:
- Prose verbatim, in reading order. Keep section headings as Markdown headings (## for sections, ### below).
- ALL math in LaTeX: inline as $...$; a display equation as $$ on a line of its own, the equation, then $$ on a
  line of its own. Every symbol, vector arrow, subscript and limit exactly as printed (\\vec B, \\oint_M,
  \\mu_0 I_{\\text{enclosed}}).
- Keep the source's equation numbers with \\tag{} at the end of the display equation: one printed as "... (4.53)"
  ends in \\tag{4.53}.
- Figures: a blockquote "> **Figure 4.71:** ..." describing what it shows precisely — every label, direction,
  radius, current and arrow — so a reader could redraw it.
- Worked examples and exercises: a heading with the source's own label and number ("### Illustration 4.16",
  "### Exercise 4.16", "### Problem 3"), the full statement, and the full solution when the page has one.
- Tables as Markdown tables.
- If something is illegible, write [illegible] — never guess at numbers.
- Output ONLY the transcription: no preface, no commentary, no code fences around it.`;

export interface ExtractMaterialOptions {
	engine: PiEngine;
	headless?: HeadlessApi;
	abortSignal?: AbortSignal;
	/** Progress after each page (the store writes it for the card). */
	onPage?: (done: number, total: number, markdown: string) => void;
}

export interface ExtractedMaterial {
	markdown: string;
	pageCount: number;
}

/** Does every math span in this Markdown parse in KaTeX? */
export function mathParses(markdown: string): boolean {
	for (const span of readContentSpans(markdown)) {
		if (span.kind !== "math") continue;
		try {
			katex.renderToString(span.body, { displayMode: span.display, throwOnError: true, strict: "ignore" });
		} catch {
			return false;
		}
	}
	return true;
}

/** One vision call: the page image in, its Markdown out. */
async function transcribeImage(engine: PiEngine, base64: string, mimeType: string, abortSignal?: AbortSignal): Promise<string> {
	const messages: Message[] = [
		{
			role: "user",
			content: [
				{ type: "text", text: "Transcribe this page." },
				{ type: "image", data: base64, mimeType },
			],
			timestamp: Date.now(),
		},
	];
	const stream = engine.streamFn(engine.model, normalizeContext({ systemPrompt: TRANSCRIBE_PROMPT, messages, tools: [] }), {
		signal: abortSignal,
	} as never);
	let result: AssistantMessage | null = null;
	for await (const event of stream) {
		if (event.type === "done") {
			result = event.message;
			break;
		}
		if (event.type === "error") throw new Error(event.error.errorMessage ?? "the model call failed");
	}
	if (!result) throw new Error("the model stream ended without a result");
	return result.content
		.filter((b) => b.type === "text")
		.map((b) => (b as { text: string }).text)
		.join("")
		.replace(/^```(?:markdown)?\n([\s\S]*)\n```\s*$/, "$1")
		.trim();
}

/** A page whose text layer can be trusted as is: plenty of text, no
 *  images, no math (the pdf-reader's triage signals). */
function textOnly(page: { text_length: number; image_count: number; math_density: number }): boolean {
	return page.text_length > 400 && page.image_count === 0 && page.math_density < 0.01;
}

export async function extractMaterial(filePath: string, mime: string, opts: ExtractMaterialOptions): Promise<ExtractedMaterial> {
	if (mime !== "application/pdf") {
		const base64 = fs.readFileSync(filePath).toString("base64");
		let markdown = await transcribeImage(opts.engine, base64, mime, opts.abortSignal);
		if (!mathParses(markdown)) markdown = await transcribeImage(opts.engine, base64, mime, opts.abortSignal);
		opts.onPage?.(1, 1, markdown);
		return { markdown, pageCount: 1 };
	}

	const headless = opts.headless ?? getHeadless();
	const info = await pdfInfo(filePath);
	const total = Math.min(info.page_count, MATERIAL_MAX_PAGES);
	const parts: string[] = [];
	for (let page = 1; page <= total; page++) {
		if (opts.abortSignal?.aborted) throw new Error("aborted");
		const signals = info.pages[page - 1];
		let text: string;
		if (signals && textOnly(signals)) {
			text = (await pdfExtract(filePath, String(page))).trim();
		} else {
			const [rendered] = await headless.renderPdfPages(filePath, [page], { dpi: 150 });
			if (!rendered) throw new Error(`page ${page} did not render`);
			text = await transcribeImage(opts.engine, rendered.png.toString("base64"), "image/png", opts.abortSignal);
			if (!mathParses(text)) {
				const [sharper] = await headless.renderPdfPages(filePath, [page], { dpi: 200 });
				if (sharper) text = await transcribeImage(opts.engine, sharper.png.toString("base64"), "image/png", opts.abortSignal);
			}
		}
		parts.push(`${materialPageMark(page)}\n\n${text}`);
		opts.onPage?.(page, total, parts.join("\n\n"));
	}
	if (info.page_count > total) {
		parts.push(`<!-- pages ${total + 1}–${info.page_count} were not transcribed (limit ${MATERIAL_MAX_PAGES}) -->`);
	}
	return { markdown: parts.join("\n\n"), pageCount: info.page_count };
}
