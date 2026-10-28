
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { HStack } from "@astryxdesign/core/HStack";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Button } from "@astryxdesign/core/Button";
import { cn } from "@/lib/utils";
import type { MermaidErrorComponentProps } from "streamdown";

/**
 * Fallback for mermaid diagrams that fail to parse — wired via Streamdown's
 * `mermaid.errorComponent`. Replaces the default light-themed red box with a
 * card matching the app: the error, the source in a details block (so a
 * broken diagram doesn't flood the transcript), and a retry.
 */
export const MermaidError = ({
	chart,
	error,
	retry,
	className,
}: MermaidErrorComponentProps & { className?: string }) => (
	<div
		className={cn(
			"my-4 rounded-lg border border-error/40 bg-error/5 p-4",
			className,
		)}
		data-streamdown="mermaid-error"
	>
		<p className="text-sm font-medium text-error">
			Diagram failed to render
		</p>
		<p className="mt-1 font-mono text-xs break-words text-secondary">
			{error}
		</p>
		<Collapsible defaultIsOpen={false}  trigger={
<HStack gap={2} align="center" className="min-w-0 text-xs text-secondary">
				Show diagram source
			
</HStack>
}>
			<CodeBlock code={chart} language="plaintext" isWrapped maxHeight={256} />
		</Collapsible>
		<Button variant="secondary" size="sm" label="Retry" className="mt-3" onClick={retry} />
	</div>
);
