import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { PlanToolContext } from "./plan.ts";
import { invalidInputResult } from "../tool-execute.ts";

/**
 * concept_done: the teacher closes one plan node. Called once the learner
 * has demonstrated the node (its checks passed). The call carries a short
 * recap of what the node established and names the next node, and it ENDS
 * THE TURN: the learner reads the recap, then presses Continue (or writes
 * anything) to start the next concept. The UI renders the call as the
 * recap card and marks the node done in the plan sidebar; the result
 * persists in the record like any server tool result.
 */
export const conceptDoneInput = Type.Object({
	nodeId: Type.String({ description: "The plan node just completed — an exact plan_init slug." }),
	recap: Type.Array(Type.String(), {
		minItems: 1,
		maxItems: 4,
		description:
			"2–4 short recap lines of what this concept established, in the learner's terms — the facts he should be able to recall later. One idea per line, no filler.",
	}),
	nextNodeId: Type.Optional(
		Type.String({ description: "The plan node to teach next — an exact plan_init slug. Omit only when the whole plan is done." }),
	),
	nextHint: Type.Optional(
		Type.String({
			description:
				"One sentence previewing the next concept as a question or tension the recap sets up (e.g. 'So what happens to the signal when the brake sits on the cAMP machine?'). Don't teach it yet.",
		}),
	),
});

export type ConceptDoneInput = Static<typeof conceptDoneInput>;

/** What the record keeps for the UI (titles resolved at call time). */
export interface ConceptDoneDetails {
	nodeId: string;
	title: string;
	nextNodeId: string | null;
	nextTitle: string | null;
}

export function conceptDoneTool(ctx: Pick<PlanToolContext, "chatId" | "chatStore">): AgentTool<typeof conceptDoneInput> {
	return {
		name: "concept_done",
		label: "concept_done",
		description:
			"Close the current plan node once the learner has demonstrated it (its checks passed). Gives a short recap and names the next node; " +
			"the turn ENDS here and the learner presses Continue to start the next concept. Call it once per node, after the node's last passed check — never mid-explanation, never before a check has landed.",
		parameters: conceptDoneInput,
		execute: async (_toolCallId, input): Promise<AgentToolResult<ConceptDoneDetails | { tool: string; problems: string[] }>> => {
			const tree = ctx.chatStore.getChat(ctx.chatId)?.tree;
			const titles = new Map((tree?.nodes ?? []).map((n) => [n.id, n.title]));
			const problems: string[] = [];
			if (titles.size === 0) problems.push("No plan map exists yet — call plan_init first.");
			else {
				if (!titles.has(input.nodeId)) problems.push(`nodeId "${input.nodeId}" matches no node in this session's plan map.`);
				if (input.nextNodeId !== undefined && !titles.has(input.nextNodeId))
					problems.push(`nextNodeId "${input.nextNodeId}" matches no node in this session's plan map.`);
				if (input.nextNodeId === input.nodeId) problems.push("nextNodeId must differ from nodeId.");
			}
			const recap = input.recap.map((l) => l.trim()).filter(Boolean);
			if (recap.length === 0) problems.push("recap needs at least one non-empty line.");
			if (problems.length > 0) return invalidInputResult("concept_done", problems);

			const details: ConceptDoneDetails = {
				nodeId: input.nodeId,
				title: titles.get(input.nodeId)!,
				nextNodeId: input.nextNodeId ?? null,
				nextTitle: input.nextNodeId ? titles.get(input.nextNodeId)! : null,
			};
			return {
				content: [
					{
						type: "text",
						text: details.nextTitle
							? `Concept closed — the turn ends here. The learner presses Continue to start "${details.nextTitle}" (${details.nextNodeId}); teach that node next.`
							: "Concept closed — the plan is complete. The turn ends here.",
					},
				],
				details,
				terminate: true,
			};
		},
	};
}
