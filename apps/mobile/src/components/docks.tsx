/**
 * The bottom docks that replace the composer while the tutor waits on the
 * learner: the question card (quiz / probe / ask / explain / recall) and the
 * practice problem. Answers are built with the engine core's own
 * buildAnswer, so the server receives exactly what the web sends.
 */
import { ChevronDown, ChevronUp, Play } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
	buildAnswer,
	CONFIDENCE_STOPS,
	dismissedAnswer,
	emptyDockSelection,
	normalizeOptions,
	normalizeQuizType,
	parseAskInput,
	parseExplainInput,
	parseQuizInput,
	resolveCorrect,
	seededRandom,
	shuffleOptions,
	toggleOption,
	toggleOther,
	toolQuestionKind,
	type AskToolInput,
	type DockSelection,
	type ExplainToolInput,
	type QuestionAnswerData,
	type QuestionData,
	type QuestionMode,
	type QuizToolInput,
} from "@/src/core";
import { Markdown } from "@/components/markdown";
import { Badge, Button, SelectableCard } from "@/components/ui";
import { colors, CONFIDENCE_COLORS, fonts, radius, shadows, spacing, text } from "@/theme";

const MAX_DOCK = Math.round(Dimensions.get("window").height * 0.62);

type QuestionTool = "quiz" | "probe" | "ask_user_question" | "explain" | "recall";

export function QuestionDock({
	toolName,
	toolCallId,
	input,
	needsReveal,
	isDisabled,
	onSubmit,
	onSkip,
}: {
	toolName: QuestionTool;
	toolCallId: string;
	input: unknown;
	/** A teach-phase check behind "Check your understanding". */
	needsReveal: boolean;
	isDisabled?: boolean;
	onSubmit: (answer: QuestionAnswerData) => void;
	onSkip: (answer: QuestionAnswerData) => void;
}) {
	const canonical = toolName === "probe" ? "quiz" : toolName === "recall" ? "explain" : toolName;
	const parsed = canonical === "quiz" ? parseQuizInput(input) : canonical === "explain" ? parseExplainInput(input) : parseAskInput(input);
	const [expanded, setExpanded] = useState(!needsReveal);

	if (!parsed) {
		return (
			<View style={[dock.shell, { padding: spacing[4] }]}>
				<Text style={dock.muted}>This question arrived malformed. The tutor will retry.</Text>
			</View>
		);
	}
	const label =
		toolName === "probe"
			? "Probe"
			: toolName === "recall"
				? "Recall"
				: canonical === "quiz"
					? normalizeQuizType((parsed as { type?: unknown }).type) === "predict"
						? "Prediction"
						: "Check"
					: canonical === "explain"
						? "Explain"
						: "Question";

	if (!expanded) {
		return (
			<Pressable onPress={() => setExpanded(true)} style={[dock.shell, dock.bar]}>
				{needsReveal ? (
					<>
						<View style={dock.playDisc}>
							<Play size={13} color={colors.primary} fill={colors.primary} />
						</View>
						<View style={{ flex: 1 }}>
							<Text style={dock.barTitle}>Check your understanding</Text>
							<Text style={dock.muted} numberOfLines={1}>
								Read the lesson above, then open the question.
							</Text>
						</View>
						<Text style={dock.barAction}>Open</Text>
					</>
				) : (
					<>
						<Badge label={label} />
						<Text style={[dock.muted, { flex: 1 }]} numberOfLines={1}>
							{parsed.question}
						</Text>
						<ChevronUp size={16} color={colors.foreground} />
					</>
				)}
			</Pressable>
		);
	}

	return (
		<QuestionForm
			key={toolCallId}
			toolName={toolName}
			toolCallId={toolCallId}
			input={parsed}
			label={label}
			isDisabled={isDisabled}
			onCollapse={() => setExpanded(false)}
			onSubmit={onSubmit}
			onSkip={onSkip}
		/>
	);
}

function QuestionForm({
	toolName,
	toolCallId,
	input,
	label,
	isDisabled,
	onCollapse,
	onSubmit,
	onSkip,
}: {
	toolName: QuestionTool;
	toolCallId: string;
	input: QuizToolInput | AskToolInput | ExplainToolInput;
	label: string;
	isDisabled?: boolean;
	onCollapse: () => void;
	onSubmit: (answer: QuestionAnswerData) => void;
	onSkip: (answer: QuestionAnswerData) => void;
}) {
	const kind = toolQuestionKind(toolName);

	// Same QuestionData as the web dock: seeded shuffle by call id, so the
	// display order (and the snapshot in the answer) matches across devices.
	const qd = useMemo<QuestionData>(() => {
		const quizInput = kind === "quiz" ? (input as QuizToolInput) : null;
		const askInput = kind === "ask" ? (input as AskToolInput) : null;
		const explainInput = kind === "explain" ? (input as ExplainToolInput) : null;
		const multi = "multiSelect" in input ? input.multiSelect === true : false;
		const mode: QuestionMode =
			kind === "quiz" ? (multi ? "multi-select" : "single-select") : askInput?.options?.length ? (multi ? "multi-select" : "single-select") : "text";
		const options = normalizeOptions((quizInput?.options ?? askInput?.options ?? []) as { label: string; value?: string }[]);
		const ordered = kind === "quiz" && options.length > 0 ? shuffleOptions(options, seededRandom(toolCallId)) : options;
		const q: QuestionData = {
			id: toolCallId,
			kind,
			questionType: kind === "quiz" ? normalizeQuizType((input as { type?: unknown }).type) : undefined,
			question: input.question,
			context: input.details,
			mode,
			options: ordered,
			createdAt: new Date().toISOString(),
		};
		if (quizInput) {
			q.correctIndices = resolveCorrect(quizInput.correctAnswer, ordered).indices;
			q.explanation = quizInput.explanation;
		}
		if (explainInput) q.committedAnswer = explainInput.correctAnswer;
		return q;
	}, [toolCallId, kind, input]);

	const [sel, setSel] = useState<DockSelection>(emptyDockSelection);
	const [thinking, setThinking] = useState("");
	const [other, setOther] = useState("");
	const [answerText, setAnswerText] = useState("");
	const [confIdx, setConfIdx] = useState<number | null>(null);
	const selectMode = qd.mode === "multi-select" ? "multi-select" : "single-select";

	const hasAnswer =
		qd.mode === "text" ? answerText.trim().length > 0 : sel.dontKnow || (sel.otherSelected && other.trim().length > 0) || sel.selected.size > 0;
	// Confidence is required on a real quiz answer (not on "I don't know").
	const needsConfidence = kind === "quiz" && !sel.dontKnow && sel.selected.size > 0 && confIdx === null;
	const canSubmit = hasAnswer && !needsConfidence && !isDisabled;

	const submit = () => {
		if (!canSubmit) return;
		onSubmit(
			buildAnswer(
				qd,
				{
					dontKnow: sel.dontKnow,
					values: [...sel.selected].map((i) => qd.options[i]!.value),
					other: sel.otherSelected ? other : undefined,
					text: qd.mode === "text" ? answerText : undefined,
					thinking: qd.mode !== "text" ? thinking.trim() || undefined : undefined,
					confidence: kind === "quiz" && confIdx !== null ? CONFIDENCE_STOPS[confIdx] : undefined,
				},
				toolName,
			),
		);
	};

	const multi = qd.mode === "multi-select";

	return (
		<View style={[dock.shell, { maxHeight: MAX_DOCK }]}>
			<View style={dock.header}>
				<Badge label={label} variant="info" />
				{multi ? <Text style={dock.muted}>Pick all that apply</Text> : null}
				<View style={{ flex: 1 }} />
				<Pressable accessibilityLabel="Minimize question" onPress={onCollapse} hitSlop={10}>
					<ChevronDown size={18} color={colors.mutedForeground} />
				</Pressable>
			</View>
			<ScrollView style={{ flexGrow: 0 }} contentContainerStyle={dock.content} keyboardShouldPersistTaps="handled">
				<Markdown size={text.prose}>{qd.question}</Markdown>
				{qd.context ? <Markdown size={text.base}>{qd.context}</Markdown> : null}

				{qd.mode !== "text" ? (
					<View style={{ gap: spacing[2] }}>
						{qd.options.map((o, i) => (
							<SelectableCard
								key={o.value + i}
								label={o.label}
								isSelected={sel.selected.has(i)}
								onChange={() => setSel(toggleOption(selectMode, sel, i))}
							>
								<View style={[dock.marker, multi && { borderRadius: 4 }, sel.selected.has(i) && dock.markerOn]}>
									<Text style={[dock.markerText, sel.selected.has(i) && { color: colors.primaryForeground }]}>{String.fromCharCode(65 + i)}</Text>
								</View>
								<View style={{ flex: 1, gap: 2 }}>
									<Markdown size={text.base + 1}>{o.label}</Markdown>
									{o.description ? <Text style={dock.muted}>{o.description}</Text> : null}
								</View>
							</SelectableCard>
						))}
						{kind === "quiz" ? (
							<SelectableCard
								label="I don't know"
								isSelected={sel.dontKnow}
								onChange={() => setSel((prev) => ({ selected: new Set(), otherSelected: false, dontKnow: !prev.dontKnow }))}
							>
								<View style={[dock.marker, sel.dontKnow && dock.markerOn]}>
									<Text style={[dock.markerText, sel.dontKnow && { color: colors.primaryForeground }]}>?</Text>
								</View>
								<Text style={dock.optionText}>I don't know</Text>
							</SelectableCard>
						) : (
							<SelectableCard label="Other" isSelected={sel.otherSelected} onChange={() => setSel(toggleOther(selectMode, sel))}>
								<View style={[dock.marker, sel.otherSelected && dock.markerOn]}>
									<Text style={[dock.markerText, sel.otherSelected && { color: colors.primaryForeground }]}>…</Text>
								</View>
								<TextInput
									value={other}
									onChangeText={(v) => {
										setOther(v);
										if (!sel.otherSelected && v) setSel(toggleOther(selectMode, sel));
									}}
									placeholder="Other…"
									placeholderTextColor={colors.disabled}
									style={[dock.optionText, { flex: 1, paddingVertical: 0 }]}
								/>
							</SelectableCard>
						)}
					</View>
				) : (
					<Field label="Your answer" value={answerText} onChange={setAnswerText} placeholder="Explain it in your own words." rows={4} />
				)}

				{kind === "quiz" && !sel.dontKnow ? (
					<View style={{ gap: spacing[2] }}>
						<Text style={dock.fieldLabel}>{confIdx === null ? "How sure are you?" : `Confidence ${CONFIDENCE_STOPS[confIdx]}%`}</Text>
						<View style={dock.stops}>
							{CONFIDENCE_STOPS.map((v, i) => {
								const on = confIdx === i;
								return (
									<Pressable
										key={v}
										accessibilityLabel={`${v} percent sure`}
										onPress={() => setConfIdx(i)}
										style={[dock.stop, on && { backgroundColor: CONFIDENCE_COLORS[i], borderColor: CONFIDENCE_COLORS[i] }]}
									>
										<Text style={[dock.stopText, on && { color: "#0b0b0c" }]}>{v}</Text>
									</Pressable>
								);
							})}
						</View>
					</View>
				) : null}

				{qd.mode !== "text" ? (
					<Field label="Your thinking" value={thinking} onChange={setThinking} placeholder="Why this answer? Doubts welcome." rows={2} />
				) : null}
			</ScrollView>
			<View style={dock.footer}>
				<Button label="Skip" variant="ghost" size="sm" onClick={() => onSkip(dismissedAnswer(kind, qd.question))} />
				<Text style={[dock.muted, { flex: 1, textAlign: "right" }]} numberOfLines={1}>
					{isDisabled ? "Compacting session…" : needsConfidence ? "Set how sure you are" : ""}
				</Text>
				<Button label="Submit answer" variant="primary" size="sm" isDisabled={!canSubmit} onClick={submit} />
			</View>
		</View>
	);
}

/** Practice: the problem statement and the learner's working. */
export function PracticeDock({
	problemCallId,
	statement,
	isDisabled,
	onSubmit,
}: {
	problemCallId: string;
	statement: string;
	isDisabled?: boolean;
	onSubmit: (text: string) => void;
}) {
	const [expanded, setExpanded] = useState(true);
	const [thinking, setThinking] = useState("");
	if (!expanded) {
		return (
			<Pressable onPress={() => setExpanded(true)} style={[dock.shell, dock.bar]}>
				<Badge label="Problem" />
				<Text style={[dock.muted, { flex: 1 }]} numberOfLines={1}>
					{statement}
				</Text>
				<ChevronUp size={16} color={colors.foreground} />
			</Pressable>
		);
	}
	const submit = () => {
		const t = thinking.trim();
		if (!t || isDisabled) return;
		setThinking("");
		onSubmit(t);
	};
	return (
		<View key={problemCallId} style={[dock.shell, { maxHeight: MAX_DOCK }]}>
			<View style={dock.header}>
				<Badge label="Problem" variant="info" />
				<View style={{ flex: 1 }} />
				<Pressable accessibilityLabel="Minimize problem" onPress={() => setExpanded(false)} hitSlop={10}>
					<ChevronDown size={18} color={colors.mutedForeground} />
				</Pressable>
			</View>
			<ScrollView style={{ flexGrow: 0 }} contentContainerStyle={dock.content} keyboardShouldPersistTaps="handled">
				<Markdown size={text.prose}>{statement}</Markdown>
				<Field label="Your thinking" value={thinking} onChange={setThinking} placeholder="Work here, think out loud." rows={4} />
			</ScrollView>
			<View style={dock.footer}>
				<Text style={[dock.muted, { flex: 1 }]}>{isDisabled ? "Compacting session…" : "Claim an answer whenever you're ready."}</Text>
				<Button label="Submit thinking" variant="primary" size="sm" isDisabled={!thinking.trim() || isDisabled} onClick={submit} />
			</View>
		</View>
	);
}

function Field({
	label,
	value,
	onChange,
	placeholder,
	rows,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	placeholder: string;
	rows: number;
}) {
	return (
		<View style={dock.field}>
			<Text style={dock.fieldLabel}>{label}</Text>
			<TextInput
				value={value}
				onChangeText={onChange}
				placeholder={placeholder}
				placeholderTextColor={colors.disabled}
				multiline
				style={[dock.fieldInput, { minHeight: rows * 22 }]}
			/>
		</View>
	);
}

const dock = StyleSheet.create({
	shell: {
		backgroundColor: colors.card,
		borderRadius: radius.xl,
		borderWidth: 1,
		borderColor: colors.input,
		overflow: "hidden",
		...shadows.med,
	},
	bar: { flexDirection: "row", alignItems: "center", gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
	barTitle: { color: colors.foreground, fontFamily: fonts.medium, fontSize: text.base },
	barAction: { color: colors.primary, fontFamily: fonts.medium, fontSize: text.sm },
	playDisc: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: colors.selected, alignItems: "center", justifyContent: "center" },
	header: { flexDirection: "row", alignItems: "center", gap: spacing[2], paddingHorizontal: spacing[4], paddingTop: spacing[3] },
	content: { padding: spacing[4], gap: spacing[3] },
	muted: { color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: text.sm },
	optionText: { color: colors.foreground, fontFamily: fonts.regular, fontSize: text.base + 1 },
	marker: {
		width: 24,
		height: 24,
		borderRadius: radius.pill,
		borderWidth: 1,
		borderColor: colors.input,
		alignItems: "center",
		justifyContent: "center",
	},
	markerOn: { backgroundColor: colors.primary, borderColor: colors.primary },
	markerText: { color: colors.mutedForeground, fontFamily: fonts.medium, fontSize: text.xs },
	stops: { flexDirection: "row", gap: spacing[1] + 2 },
	stop: {
		flex: 1,
		height: 34,
		borderRadius: radius.md,
		borderWidth: 1,
		borderColor: colors.input,
		backgroundColor: colors.surface,
		alignItems: "center",
		justifyContent: "center",
	},
	stopText: { color: colors.foreground, fontFamily: fonts.medium, fontSize: text.sm },
	field: { backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing[2] + 2, gap: 4 },
	fieldLabel: { color: colors.mutedForeground, fontFamily: fonts.medium, fontSize: text.xs },
	fieldInput: { color: colors.foreground, fontFamily: fonts.regular, fontSize: text.base + 1, textAlignVertical: "top", paddingVertical: 0 },
	footer: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing[2],
		paddingHorizontal: spacing[3],
		paddingVertical: spacing[2],
		borderTopWidth: 1,
		borderTopColor: colors.border,
	},
});
