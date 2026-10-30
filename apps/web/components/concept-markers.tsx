import type { PlanTree } from "@/src/core";
import { continueMessage } from "@/components/concept-done-card";

export interface ConceptOpening {
	nodeId: string;
	/** True when the opening IS the learner's Continue message (rendered as
	 *  the divider instead of a chat bubble). */
	viaContinue: boolean;
}

type ViewMessage = { role?: string; parts?: Array<{ type: string; state?: string; text?: string; input?: unknown }> };

const CONTINUE_PREFIX = continueMessage("");

/** Key of an opening slot: before part `pi` of message `mi`, or the whole
 *  message (`"u"`) for the learner's Continue message. */
export function openingKey(mi: number, pi: number | "u"): string {
	return `${mi}:${pi}`;
}

/**
 * Where each concept opens in the transcript. A concept opens at the
 * learner's Continue message when there is one; otherwise (the first
 * concept, older sessions) right after the previous concept's last check or
 * close — the new concept's teaching starts there, above its first check.
 * Assistant turns are merged into long view messages, so openings are
 * placed per part, not per message.
 */
export function conceptOpenings(messages: readonly ViewMessage[], tree: PlanTree | null): Map<string, ConceptOpening> {
	const out = new Map<string, ConceptOpening>();
	if (!tree) return out;
	const ids = new Set(tree.nodes.map((n) => n.id));
	let current: string | null = null;
	let pendingNext: string | null = null;
	/** The last part that belonged to the current concept (check or close). */
	let lastMark: { mi: number; pi: number } | null = null;
	messages.forEach((m, mi) => {
		const parts = m.parts ?? [];
		if (m.role === "user") {
			const text = parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("").trim();
			if (pendingNext && text.startsWith(CONTINUE_PREFIX)) {
				out.set(openingKey(mi, "u"), { nodeId: pendingNext, viaContinue: true });
				current = pendingNext;
				lastMark = null;
			}
			pendingNext = null;
			return;
		}
		parts.forEach((part, pi) => {
			const input = part.input as { nodeId?: unknown; nextNodeId?: unknown } | undefined;
			const nodeId = typeof input?.nodeId === "string" ? input.nodeId : null;
			if (!nodeId || !ids.has(nodeId)) return;
			if (part.type === "tool-quiz" || part.type === "tool-explain") {
				if (nodeId !== current) {
					const at = lastMark && lastMark.mi === mi ? lastMark.pi + 1 : 0;
					out.set(openingKey(mi, at), { nodeId, viaContinue: false });
					current = nodeId;
				}
				lastMark = { mi, pi };
			} else if (part.type === "tool-concept_done" && part.state === "output-available") {
				pendingNext = typeof input?.nextNodeId === "string" && ids.has(input.nextNodeId) ? input.nextNodeId : null;
				lastMark = { mi, pi };
			}
		});
	});
	return out;
}

/** The divider that opens a concept in the transcript. */
export function ConceptOpener({ number, title, nodeId }: { number: number; title: string; nodeId: string }) {
	return (
		<div
			id={conceptAnchorId(nodeId)}
			data-concept-id={nodeId}
			data-testid="concept-opener"
			className="my-6 flex scroll-mt-24 items-center gap-3"
		>
			<div className="h-px flex-1 bg-gradient-to-r from-transparent to-border" aria-hidden />
			<div className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 py-1 pl-1 pr-3.5">
				<span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-medium tabular-nums text-primary-foreground">
					{number}
				</span>
				<span className="text-xs text-muted-foreground">Concept</span>
				<span className="text-sm font-medium text-foreground">{title}</span>
			</div>
			<div className="h-px flex-1 bg-gradient-to-l from-transparent to-border" aria-hidden />
		</div>
	);
}

export function conceptAnchorId(nodeId: string): string {
	return `concept-${nodeId}`;
}
