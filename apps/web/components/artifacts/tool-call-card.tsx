
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { HStack } from "@astryxdesign/core/HStack";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { ChevronRight } from "lucide-react";
import type { ArtifactPartProps } from "@/src/core";

/**
 * The generic tool-call card (sources v1, 2026-09-19): a quiet, collapsed
 * one-liner per synchronous tool call — the tool name plus the headline
 * argument — expandable to the full input and output. The user's spec:
 * "at least the tool name; for read, the file name; everything collapsed
 * by default; not distracting — background stuff." Unregistered tools
 * still render nothing (chat.tsx's registry default); this card is only
 * for the learner-filesystem set (read/ls/find/grep) where the call IS
 * worth a trace in the transcript.
 */

interface ToolCallPart {
	type: string;
	state: string;
	toolCallId: string;
	input?: unknown;
	output?: unknown;
	errorText?: string;
}

/** The collapsed headline argument per tool: path for read/ls, pattern for
 *  find/grep — shown as given, never resolved (the absolute path lands in
 *  the expanded view when present in the output). */
function headlineArg(tool: string, input: unknown): string {
	const inp = (input ?? {}) as Record<string, unknown>;
	if (tool === "read" || tool === "ls") {
		const p = typeof inp.path === "string" && inp.path.length > 0 ? inp.path : "~";
		return p;
	}
	if (typeof inp.pattern === "string") return inp.pattern;
	// list_propositions: the session id is the call's subject — the
	// collapsed line reads "list_propositions chat_…". Shown as given
	// (the id is exactly what list_sessions reported to the model).
	if (tool === "list_propositions" && typeof inp.session === "string" && inp.session.length > 0) {
		return inp.session;
	}
	return "";
}

/** Render a tool result body: plain strings verbatim, image-bearing read
 *  results show their text + an attachment note (the image itself is the
 *  model's — the learner sees only that it happened). */
function outputText(output: unknown): string | null {
	if (output == null) return null;
	if (typeof output === "string") return output;
	if (typeof output === "object" && "text" in (output as Record<string, unknown>)) {
		const o = output as { text?: unknown; images?: unknown[] };
		const text = typeof o.text === "string" ? o.text : null;
		const n = Array.isArray(o.images) ? o.images.length : 0;
		return n > 0 ? `${text ?? ""}\n[${n} image${n > 1 ? "s" : ""} attached to the model]`.trim() : text;
	}
	try {
		return JSON.stringify(output, null, 2);
	} catch {
		return String(output);
	}
}

export function ToolCallCard({ part }: ArtifactPartProps) {
	const p = part as ToolCallPart;
	const tool = p.type.replace(/^tool-/, "");
	const arg = headlineArg(tool, p.input);
	const out = outputText(p.output);
	const failed = p.state === "output-error" || typeof p.errorText === "string";
	return (
		<Collapsible defaultIsOpen={false} data-testid="tool-call-card" data-tool={tool} trigger={
<HStack gap={2} align="center" className="min-w-0 text-xs text-secondary">
				<span className={`font-medium ${failed ? "text-red-500": ""}`}>
					{tool}
				</span>
				{arg && <span className="truncate">{arg}</span>}
			
</HStack>
}>
			<div className="mt-2 space-y-2 rounded-lg border bg-card p-3 text-xs">
				{p.input != null && (
					<div>
						<div className="mb-1 font-medium text-secondary">
							Input
						</div>
						<CodeBlock code={JSON.stringify(p.input, null, 2)} language="json" isWrapped maxHeight={256} />
					</div>
				)}
				{typeof p.errorText === "string" ? (
					<div>
						<div className="mb-1 font-medium text-secondary">
							Error
						</div>
						<CodeBlock code={p.errorText} language="plaintext" isWrapped maxHeight={256} />
					</div>
				) : out != null ? (
					<div>
						<div className="mb-1 font-medium text-secondary">
							Output
						</div>
						<CodeBlock code={out} language="plaintext" isWrapped maxHeight={256} />
					</div>
				) : (
					p.state !== "output-available" && (
						<div className="text-secondary italic">running…</div>
					)
				)}
			</div>
		</Collapsible>
	);
}
