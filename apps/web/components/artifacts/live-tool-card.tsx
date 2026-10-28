
import { Text } from "@astryxdesign/core/Text";
import { Spinner } from "@astryxdesign/core/Spinner";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { HStack } from "@astryxdesign/core/HStack";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { ChevronRight } from "lucide-react";
import { toolActivityLabel } from "@/src/core";
import type { ArtifactPartProps } from "@/src/core";

/**
 * The LIVE tool-input card (owner, streaming round 2026-10-01): what a
 * tool call looks like while the agent WRITES it. A tool part sits in
 * `input-streaming` for its whole execution (the bridge defers
 * input-available to tool_execution_end), so this card IS the working
 * state — spinner + shimmered activity label in the header (the retired
 * transcript bottom line's text, same recipe as the thinking row), and
 * the streaming input itself watchable on expand. The moment the call
 * settles, the part re-renders through the artifact registry and the
 * quiet settled card replaces this one.
 *
 * The one working-state grammar everywhere (owner): Braille spinner +
 * Shimmer(duration 1) — the thinking row, this card, the sidebar row.
 */
interface StreamingToolPart {
	type: string;
	state: string;
	toolCallId: string;
	input?: unknown;
}

export function LiveToolCard({ part }: ArtifactPartProps) {
	const p = part as StreamingToolPart;
	const tool = p.type.replace(/^tool-/, "");
	const inp = (p.input ?? {}) as Record<string, unknown>;
	// The headline argument (ToolCallCard's rule, shown as given): path for
	// read/ls, pattern for find/grep, session for list_propositions.
	let arg = "";
	if (typeof inp.path === "string" && inp.path) arg = inp.path;
	else if (typeof inp.pattern === "string" && inp.pattern) arg = inp.pattern;
	else if (typeof inp.session === "string" && inp.session) arg = inp.session;

	const hasInput = p.input != null && Object.keys(inp).length > 0;

	return (
		<Collapsible defaultIsOpen={false} data-testid="live-tool-card" data-tool={tool} trigger={
<HStack gap={2} align="center" className="min-w-0 text-xs text-secondary">
				<Spinner size="sm" label={`${toolActivityLabel(tool)} — live`} />
				<Text type="supporting">
					{toolActivityLabel(tool)}
				</Text>
				{arg && <span className="truncate">{arg}</span>}
			
</HStack>
}>
			<div className="mt-2 rounded-lg border bg-card p-3 text-xs">
				<div className="mb-1 font-medium text-secondary">Input (streaming)</div>
				<CodeBlock code={hasInput ? JSON.stringify(p.input, null, 2) : "…"} language="json" isWrapped maxHeight={256} />
			</div>
		</Collapsible>
	);
}
