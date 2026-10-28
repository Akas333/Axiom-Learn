/**
 * Transcript cards: the phone versions of the web's chat cards (answered
 * question, concept done, plan block, assessment, practice, live tool), built
 * from the Astryx primitives in ui.tsx.
 */
import { ArrowRight, Check, CircleDot, ClipboardCheck, Flag, Lightbulb, X } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
	answerForPresentation,
	parseProbeDoneInput,
	toolActivityLabel,
	type LhViewPart,
	type PlanBlockData,
	type QuestionAnswerData,
} from "@/src/core";
import { Markdown } from "@/components/markdown";
import { Badge, BusyLine, Button, Card, Collapsible, LabelRule } from "@/components/ui";
import { colors, CONFIDENCE_COLORS, fonts, radius, spacing, text } from "@/theme";

const CONFIDENCE_STOPS = [0, 30, 50, 70, 90, 100];

/** "Continue to the next concept: …" — the same text the web sends. */
export function continueMessage(nextTitle: string): string {
	return `Continue to the next concept: ${nextTitle}`;
}

function kindLabel(a: QuestionAnswerData): string {
	if (a.tool === "probe") return "Probe";
	if (a.tool === "recall") return "Recall";
	if (a.kind === "quiz") return a.questionType === "predict" ? "Prediction" : "Check";
	if (a.kind === "explain") return "Explain";
	return "Question";
}

/** A question the learner already answered: their pick, the grade, confidence, thinking. */
export function AnsweredCard({ answer: saved, input }: { answer: QuestionAnswerData; input?: unknown }) {
	const answer = answerForPresentation(saved, input);
	const [whyOpen, setWhyOpen] = useState(false);
	if (answer.dismissed) {
		return (
			<Card padding={3} variant="muted">
				<Text style={card.muted}>
					<Text style={card.strong}>{answer.questionText}</Text> — skipped
				</Text>
			</Card>
		);
	}
	const isQuiz = answer.kind === "quiz";
	const selected = new Set(answer.answers.map((a) => a.index));
	const correct = new Set(answer.correctIndices ?? []);
	const thinking = answer.thinking ?? answer.note;
	const confIdx = answer.confidence !== undefined ? CONFIDENCE_STOPS.indexOf(answer.confidence) : -1;

	return (
		<View style={{ gap: spacing[2] }}>
			{answer.readingThinking ? <ThinkingQuote label="Your thinking" text={answer.readingThinking} /> : null}
			<Card padding={4} style={{ gap: spacing[3] }}>
				<View style={card.row}>
					<Badge label={kindLabel(answer)} />
					{isQuiz && !answer.dontKnow ? (
						<Badge label={answer.correct ? "Correct" : "Not quite"} variant={answer.correct ? "success" : "error"} />
					) : null}
					{answer.dontKnow ? <Badge label="Didn't know" variant="warning" /> : null}
				</View>
				<Markdown size={text.base + 1}>{answer.questionText}</Markdown>

				{(answer.options ?? []).length > 0 ? (
					<View style={{ gap: spacing[1] + 2 }}>
						{(answer.options ?? []).map((o) => {
							const isSel = selected.has(o.index);
							const isRight = isQuiz && correct.has(o.index);
							const tone = isRight ? colors.success : isSel && isQuiz ? colors.destructive : isSel ? colors.primary : colors.border;
							return (
								<View key={o.index} style={[card.option, { borderColor: isSel || isRight ? tone : colors.border }]}>
									{isRight ? <Check size={15} color={colors.success} /> : isSel && isQuiz ? <X size={15} color={colors.destructive} /> : isSel ? <CircleDot size={15} color={colors.primary} /> : <View style={{ width: 15 }} />}
									<View style={{ flex: 1 }}>
										<Markdown size={text.base}>{o.label}</Markdown>
									</View>
								</View>
							);
						})}
					</View>
				) : null}

				{answer.other ? <Text style={card.body}>Other: {answer.other}</Text> : null}
				{answer.text ? (
					<View style={card.quote}>
						<Text style={card.label}>Your answer</Text>
						<Markdown size={text.base}>{answer.text}</Markdown>
					</View>
				) : null}

				{confIdx >= 0 ? (
					<View style={{ gap: 4 }}>
						<Text style={card.label}>Confidence {answer.confidence}%</Text>
						<View style={card.rail}>
							<View style={[card.railFill, { width: `${answer.confidence}%`, backgroundColor: CONFIDENCE_COLORS[confIdx] }]} />
						</View>
					</View>
				) : null}

				{thinking ? <ThinkingQuote label="Your thinking" text={thinking} /> : null}

				{answer.kind === "explain" && answer.committed ? (
					<Collapsible trigger="TUTOR'S ANSWER">
						<Markdown size={text.base}>{answer.committed}</Markdown>
					</Collapsible>
				) : null}
				{isQuiz && answer.explanation ? (
					answer.questionType === "predict" ? (
						<Collapsible trigger="WHY" isOpen={whyOpen} onOpenChange={setWhyOpen}>
							<Markdown size={text.base}>{answer.explanation}</Markdown>
						</Collapsible>
					) : (
						<View style={card.quote}>
							<Text style={card.label}>Why</Text>
							<Markdown size={text.base}>{answer.explanation}</Markdown>
						</View>
					)
				) : null}
			</Card>
		</View>
	);
}

export function ThinkingQuote({ label, text: body }: { label: string; text: string }) {
	return (
		<View style={card.thinking}>
			<Text style={card.label}>{label}</Text>
			<Text style={card.body}>{body}</Text>
		</View>
	);
}

/** End of a concept: recap, what's next, Continue. */
export function ConceptDoneCard({
	input,
	output,
	live,
	onContinue,
}: {
	input: { nodeId?: string; recap?: string[]; nextHint?: string };
	output?: { title?: string; nextTitle?: string | null };
	live: boolean;
	onContinue: (nextTitle: string) => void;
}) {
	const recap = (input.recap ?? []).filter((l) => l.trim());
	const title = output?.title ?? input.nodeId ?? "Concept";
	const nextTitle = output?.nextTitle ?? null;
	return (
		<Card padding={0} style={{ overflow: "hidden" }}>
			<View style={[card.row, { padding: spacing[4], paddingBottom: 0 }]}>
				<View style={card.doneIcon}>
					<Check size={16} color={colors.success} strokeWidth={2.5} />
				</View>
				<View style={{ flex: 1 }}>
					<Text style={card.label}>Concept complete</Text>
					<Text style={card.title} numberOfLines={2}>
						{title}
					</Text>
				</View>
			</View>
			{recap.length > 0 ? (
				<View style={{ paddingHorizontal: spacing[4], paddingTop: spacing[3], gap: spacing[2] }}>
					<Text style={card.label}>Recap</Text>
					{recap.map((line, i) => (
						<View key={i} style={card.recapRow}>
							<View style={card.dot} />
							<View style={{ flex: 1 }}>
								<Markdown size={text.base}>{line}</Markdown>
							</View>
						</View>
					))}
				</View>
			) : null}
			<View style={card.doneFooter}>
				{nextTitle ? (
					<View style={{ gap: spacing[3] }}>
						<View>
							<Text style={card.label}>Up next</Text>
							<Text style={card.strong}>{nextTitle}</Text>
							{input.nextHint ? <Text style={[card.muted, { marginTop: 2 }]}>{input.nextHint}</Text> : null}
						</View>
						{live ? (
							<Button label="Continue" variant="primary" onClick={() => onContinue(nextTitle)} iconAfter={<ArrowRight size={16} color={colors.primaryForeground} />} />
						) : (
							<Text style={card.muted}>Continued</Text>
						)}
					</View>
				) : (
					<View style={card.row}>
						<Flag size={16} color={colors.primary} />
						<Text style={card.body}>You've finished every concept in this plan.</Text>
					</View>
				)}
			</View>
		</Card>
	);
}

/** The plan as authored: concepts in order, the current one highlighted. */
export function PlanBlockCard({ data }: { data: PlanBlockData }) {
	return (
		<Card padding={4} style={{ gap: spacing[2] }}>
			<View style={card.row}>
				<Text style={card.title}>Plan</Text>
				<Badge label={`${data.nodes.length} concepts`} />
			</View>
			{data.nodes.map((n, i) => {
				const current = n.id === data.current || n.status === "current";
				const done = n.status === "visited" && !current;
				return (
					<View key={n.id} style={[card.planRow, current && { backgroundColor: colors.selected, borderColor: colors.primary }]}>
						<View style={[card.planNum, done && { backgroundColor: colors.foreground, borderColor: colors.foreground }]}>
							<Text style={[card.planNumText, done && { color: colors.background }]}>{i + 1}</Text>
						</View>
						<Text style={[card.body, { flex: 1 }, current && { color: colors.foreground, fontFamily: fonts.medium }]}>{n.title}</Text>
					</View>
				);
			})}
		</Card>
	);
}

/** The probe's conclusion: what the tutor learned about you, strand by strand. */
export function ProbeDoneCard({ part }: { part: LhViewPart }) {
	const input = parseProbeDoneInput(part.input);
	const output = part.output as { ok?: boolean; error?: string } | undefined;
	const strands = input?.assessment && Array.isArray(input.assessment.strands) ? input.assessment.strands : null;
	return (
		<Card padding={3} variant="muted" style={{ gap: spacing[2] }}>
			<View style={card.row}>
				<ClipboardCheck size={14} color={colors.primary} />
				<Text style={card.label}>Probe concluded — your assessment</Text>
			</View>
			{output && output.ok === false ? (
				<Text style={card.muted}>The prober retried: {output.error}</Text>
			) : part.state === "output-error" ? (
				<Text style={card.muted}>The assessment was malformed — the prober retried.</Text>
			) : strands ? (
				<>
					{strands.map((s, i) => (
						<View key={i} style={card.strand}>
							<Text style={card.strong}>{s.strand}</Text>
							<Text style={card.muted}>{s.assessment}</Text>
						</View>
					))}
					{input?.assessment?.summary ? <Text style={card.muted}>{input.assessment.summary}</Text> : null}
				</>
			) : (
				<Text style={card.muted}>Writing the assessment…</Text>
			)}
		</Card>
	);
}

/** A practice problem as posed. */
export function ProblemCard({ part }: { part: LhViewPart }) {
	const statement = String((part.input as { statement?: unknown } | undefined)?.statement ?? "");
	if (!statement) return null;
	return (
		<Card padding={4} style={{ gap: spacing[2] }}>
			<Text style={card.label}>Problem</Text>
			<Markdown size={text.base + 1}>{statement}</Markdown>
		</Card>
	);
}

/** A practice problem's conclusion: verdict, outcome, the model solution. */
export function ConcludeCard({ part }: { part: LhViewPart }) {
	const input = (part.input ?? {}) as { outcome?: string; verdict?: string; solutionReveal?: string };
	const reveal = typeof part.reveal === "string" ? part.reveal : input.solutionReveal;
	if (!input.outcome && !input.verdict && !reveal) return null;
	return (
		<Card padding={4} variant="muted" style={{ gap: spacing[2] }}>
			<View style={card.row}>
				<Text style={card.label}>Problem concluded</Text>
				{input.outcome ? <Badge label={input.outcome} variant={/solved|correct/i.test(input.outcome) ? "success" : "neutral"} /> : null}
			</View>
			{input.verdict ? <Markdown size={text.base}>{input.verdict}</Markdown> : null}
			{reveal ? (
				<Collapsible trigger="MODEL SOLUTION">
					<Markdown size={text.base}>{reveal}</Markdown>
				</Collapsible>
			) : null}
		</Card>
	);
}

/** The tutor's reasoning, collapsed like the web's "AGENT'S THINKING". */
export function ReasoningBlock({ text: body, streaming }: { text: string; streaming: boolean }) {
	if (!body.trim()) return streaming ? <BusyLine label="Thinking…" /> : null;
	return (
		<Collapsible trigger="AGENT'S THINKING" defaultOpen={streaming}>
			<View style={card.reasoning}>
				<Markdown size={text.base}>{body}</Markdown>
			</View>
		</Collapsible>
	);
}

/** A tool running right now. */
export function LiveToolCard({ tool }: { tool: string }) {
	return <BusyLine label={toolActivityLabel(tool)} />;
}

/** Background jobs (research, demo, visual, pdf) that the phone can't show in full yet. */
export function JobCard({ tool, part }: { tool: string; part: LhViewPart }) {
	const name = { research: "Research", demo: "Interactive demo", visual: "Visual", pdf: "PDF" }[tool] ?? tool;
	const running = part.state === "input-available" || part.state === "input-streaming";
	return (
		<Card padding={3} variant="muted">
			<View style={card.row}>
				<Lightbulb size={14} color={colors.mutedForeground} />
				<Text style={card.body}>{name}</Text>
				<Badge label={running ? "Working…" : part.state === "output-error" ? "Failed" : "Ready on desktop"} variant={running ? "info" : "neutral"} />
			</View>
		</Card>
	);
}

/** Practice: the learner's submitted thinking. */
export function PracticeThinkingCard({ text: body }: { text: string }) {
	return (
		<View style={{ alignItems: "flex-end" }}>
			<View style={[card.thinking, { maxWidth: "88%" }]}>
				<Text style={card.label}>Your thinking</Text>
				<Text style={card.body}>{body}</Text>
			</View>
		</View>
	);
}

/** Nodes picked from the knowledge graph as context for a practice session. */
export function GraphContextCard({ data }: { data: { propositions?: { id: string; name: string }[] } }) {
	const props = data.propositions ?? [];
	if (props.length === 0) return null;
	return (
		<Card padding={3} variant="muted" style={{ gap: spacing[1] }}>
			<Text style={card.label}>From your knowledge graph</Text>
			<Text style={card.body}>{props.map((p) => p.name).join(" · ")}</Text>
		</Card>
	);
}

export { LabelRule };

const card = StyleSheet.create({
	row: { flexDirection: "row", alignItems: "center", gap: spacing[2], flexWrap: "wrap" },
	label: { color: colors.mutedForeground, fontFamily: fonts.medium, fontSize: text.xs },
	title: { color: colors.foreground, fontFamily: fonts.semibold, fontSize: text.lg },
	strong: { color: colors.foreground, fontFamily: fonts.medium, fontSize: text.base },
	body: { color: colors.foreground, fontFamily: fonts.regular, fontSize: text.base, lineHeight: 20 },
	muted: { color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: text.sm, lineHeight: 19 },
	option: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing[2],
		borderWidth: 1,
		borderRadius: radius.md,
		paddingHorizontal: spacing[3],
		paddingVertical: spacing[2],
	},
	quote: { gap: 4, borderLeftWidth: 2, borderLeftColor: colors.input, paddingLeft: spacing[3] },
	thinking: { gap: 4, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing[3], borderWidth: 1, borderColor: colors.border },
	rail: { height: 6, borderRadius: radius.pill, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
	railFill: { height: "100%" },
	doneIcon: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" },
	recapRow: { flexDirection: "row", gap: spacing[2] + 2 },
	dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 9 },
	doneFooter: { marginTop: spacing[4], borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, padding: spacing[4] },
	planRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing[3],
		paddingHorizontal: spacing[2],
		paddingVertical: spacing[2],
		borderRadius: radius.md,
		borderWidth: 1,
		borderColor: "transparent",
	},
	planNum: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.input, alignItems: "center", justifyContent: "center" },
	planNumText: { color: colors.foreground, fontFamily: fonts.medium, fontSize: text.xs },
	strand: { backgroundColor: colors.background, borderRadius: radius.md, paddingHorizontal: spacing[3], paddingVertical: spacing[2], gap: 2 },
	reasoning: { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: spacing[3], opacity: 0.85 },
});
