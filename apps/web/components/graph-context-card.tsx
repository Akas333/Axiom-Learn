
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Text } from "@astryxdesign/core/Text";
import { useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The graph-context card (owner, 2026-10-04): the session's map pick —
 * message[0] of a session started with propositions picked from the
 * graph. Scaffolding, not a turn: minimal, muted, collapsed by default;
 * expand reveals the picked propositions (name — statement) and the
 * reasoning chains among them (premises → conclusion lines). The model
 * reads the same content through the marker's own text (toLlmMessages);
 * this card is the learner's face of it.
 */

/** The graph-context marker's details (native-messages.ts). */
export interface GraphContextData {
	propositions: { id: string; name: string; statement: string }[];
	chains: string[];
}

export function GraphContextCard({ data }: { data: GraphContextData }) {
	const [open, setOpen] = useState(false);
	const { propositions = [], chains = [] } = data ?? {};
	const noun = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
	return (
		<div data-testid="graph-context-card" className="my-1">
			<Collapsible
				data-testid="graph-context-toggle"
				isOpen={open}
				onOpenChange={setOpen}
				chevronPosition="start"
				trigger={
					<Text type="supporting" size="sm">
						Graph context · {noun(propositions.length, "proposition", "propositions")}
						{chains.length > 0 ? ` · ${noun(chains.length, "chain", "chains")}` : ""}
					</Text>
				}
			>
				<div data-testid="graph-context-body" className="space-y-1 text-xs">
					{propositions.map((p) => (
						<div key={p.id} data-testid={`graph-context-prop-${p.id}`} className="leading-relaxed">
							<span className="font-medium text-primary/80">{p.name}</span>
							<span className="text-secondary"> — {p.statement}</span>
						</div>
					))}
					{chains.length > 0 && (
						<div className="pt-1">
							{chains.map((c, i) => (
								<div key={i} className="font-mono text-[11px] text-secondary">
									{c}
								</div>
							))}
						</div>
					)}
				</div>
			</Collapsible>
		</div>
	);
}
