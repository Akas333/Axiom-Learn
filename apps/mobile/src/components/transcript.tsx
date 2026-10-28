import { Fragment, memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { isSubagentFailure, type LhViewMessage, type LhViewPart, type PlanBlockData, type QuestionAnswerData, type SubagentArtifactData } from "@/src/core";
import { ChatMessage, ChatMessageBubble } from "@/components/astryx/Chat";
import {
	AnsweredCard,
	ConceptDoneCard,
	ConcludeCard,
	GraphContextCard,
	JobCard,
	LabelRule,
	LiveToolCard,
	PlanBlockCard,
	PracticeThinkingCard,
	ProbeDoneCard,
	ProblemCard,
	ReasoningBlock,
} from "@/components/cards";
import { Markdown } from "@/components/markdown";
import { Badge, Card, TutorAvatar } from "@/components/ui";
import { colors, fonts, spacing, text } from "@/theme";

const QUESTION_PARTS = new Set(["tool-quiz", "tool-probe", "tool-ask_user_question", "tool-explain", "tool-recall"]);
const JOB_TOOLS = new Set(["research", "pdf", "demo", "visual"]);

/**
 * The session transcript: the projected view messages (core/view.ts) drawn
 * with Astryx ChatMessage + the transcript cards. Mirrors the part switch
 * in apps/web/components/chat.tsx.
 */
export const Transcript = memo(function Transcript({
	messages,
	streaming,
	conceptLive,
	onContinue,
}: {
	messages: LhViewMessage[];
	/** The last part is still streaming (reasoning stays open). */
	streaming: boolean;
	/** The latest concept-done card may show its Continue button. */
	conceptLive: boolean;
	onContinue: (nextTitle: string) => void;
}) {
	return (
		<>
			{messages.map((m, mi) => {
				const key = m.id || `m-${mi}`;
				if (m.role === "user") return <UserMessage key={key} message={m} />;
				const first = messages[mi - 1]?.role !== "assistant";
				const isLastMessage = mi === messages.length - 1;
				return (
					<ChatMessage key={key} sender="assistant" avatar={first ? <TutorAvatar /> : null} name={first ? "Petrov" : null}>
						{m.parts.map((part, pi) => (
							<Fragment key={part.id ?? `p-${pi}`}>
								{renderPart(part, pi, {
									isLast: isLastMessage && pi === m.parts.length - 1,
									streaming,
									conceptLive,
									onContinue,
								})}
							</Fragment>
						))}
					</ChatMessage>
				);
			})}
		</>
	);
});

/** A background agent's delivery (research, visual, demo, pdf): a status card, never a learner bubble. */
function SubagentCard({ message: m }: { message: LhViewMessage }) {
	const data = m.parts.find((p) => p.type === "data-subagent-artifact")?.data as SubagentArtifactData | undefined;
	const aborted = m.parts.some((p) => p.type === "data-subagent-aborted");
	const kind = data?.kind ?? (m.metadata as { subagentResult?: { kind?: string } } | undefined)?.subagentResult?.kind ?? "job";
	const name = { research: "Research", visual: "Visual", demo: "Interactive demo", pdf: "PDF" }[kind] ?? "Background job";
	const failed = aborted || (data ? isSubagentFailure(data.kind as never, data.result as never) : true);
	return (
		<Card padding={3} variant="muted">
			<View style={s.subagent}>
				<Text style={s.subagentName}>{name}</Text>
				<Badge label={aborted ? "Stopped" : failed ? "Couldn't finish" : "Ready on desktop"} variant={failed ? "warning" : "success"} />
			</View>
		</Card>
	);
}

function UserMessage({ message: m }: { message: LhViewMessage }) {
	if ((m.metadata as { subagentResult?: unknown } | undefined)?.subagentResult != null) return <SubagentCard message={m} />;
	if (m.parts.some((p) => p.type === "data-probe-handoff")) return <LabelRule label="Planning" />;
	if (m.parts.length > 0 && m.parts.every((p) => p.type.startsWith("data-"))) {
		return (
			<>
				{m.parts.map((p, i) => {
					switch (p.type) {
						case "data-graph-context":
							return <GraphContextCard key={i} data={(p.data ?? {}) as { propositions?: { id: string; name: string }[] }} />;
						case "data-compaction":
						case "data-compaction-cut":
							return <LabelRule key={i} label="Context compacted" />;
						case "data-practice-thinking":
							return <PracticeThinkingCard key={i} text={String((p.data as { text?: unknown } | undefined)?.text ?? "")} />;
						case "data-practice-next":
							return <LabelRule key={i} label="Next problem" />;
						default:
							return null;
					}
				})}
			</>
		);
	}
	const body = m.parts
		.filter((p) => p.type === "text")
		.map((p) => p.text)
		.join("\n");
	if (!body.trim()) return null;
	return (
		<ChatMessage sender="user">
			<ChatMessageBubble sender="user">{body}</ChatMessageBubble>
		</ChatMessage>
	);
}

function renderPart(
	part: LhViewPart,
	pi: number,
	ctx: { isLast: boolean; streaming: boolean; conceptLive: boolean; onContinue: (t: string) => void },
): ReactNode {
	// A tool call that errored back to the agent: it retries; show one quiet line.
	if (part.state === "output-error" && part.type.startsWith("tool-") && part.errorText !== "Operation aborted") {
		return <Text style={s.system}>Retrying…</Text>;
	}
	switch (part.type) {
		case "text":
			return part.text ? <Markdown>{part.text}</Markdown> : null;
		case "reasoning":
			return <ReasoningBlock text={part.text ?? ""} streaming={ctx.streaming && ctx.isLast} />;
		case "step-start":
			return pi > 0 ? <View style={s.step} /> : null;
		case "data-plan-block":
			return <PlanBlockCard data={part.data as PlanBlockData} />;
		case "tool-concept_done":
			if (part.state !== "output-available") return null;
			return (
				<ConceptDoneCard
					input={(part.input ?? {}) as { nodeId?: string; recap?: string[]; nextHint?: string }}
					output={part.output as { title?: string; nextTitle?: string | null } | undefined}
					live={ctx.isLast && ctx.conceptLive}
					onContinue={ctx.onContinue}
				/>
			);
		default: {
			if (QUESTION_PARTS.has(part.type)) {
				// Pending questions live in the dock; answered ones render as records.
				return part.state === "output-available" ? <AnsweredCard answer={part.output as QuestionAnswerData} input={part.input} /> : null;
			}
			if (!part.type.startsWith("tool-")) return null;
			const tool = part.type.slice("tool-".length);
			if (part.state === "input-streaming") return <LiveToolCard tool={tool} />;
			if (JOB_TOOLS.has(tool)) return <JobCard tool={tool} part={part} />;
			if (tool === "probe_done") return <ProbeDoneCard part={part} />;
			if (tool === "problem") return <ProblemCard part={part} />;
			if (tool === "conclude") return <ConcludeCard part={part} />;
			return null;
		}
	}
}

const s = StyleSheet.create({
	system: { color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: text.sm, fontStyle: "italic" },
	step: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing[2] },
	subagent: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing[2] },
	subagentName: { color: colors.foreground, fontFamily: fonts.medium, fontSize: text.base },
});
