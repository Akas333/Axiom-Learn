/**
 * The learner-profile controls, shared by the first-run onboarding and
 * Settings → Learner: level, how much math, explanation style, and free
 * notes. Pure controlled inputs — the caller owns saving.
 */

import {
	LEARNER_LEVELS,
	LEARNER_LEVEL_META,
	LEARNER_MATH,
	LEARNER_MATH_META,
	LEARNER_NOTES_MAX,
	LEARNER_STYLES,
	LEARNER_STYLE_META,
	type LearnerSettings,
} from "@/src/core";
import { useCallback, useRef } from "react";
import { DictationButton, DictationMeter, joinDictation, useDictation, useDictationTarget } from "@/components/dictation";
import { cn } from "@/lib/utils";
import { Button } from "@astryxdesign/core/Button";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { PlusIcon } from "lucide-react";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

/** Starting points for the notes box — one click appends the line. */
export const NOTE_EXAMPLES = [
	"I'm in 6th grade and only know basic arithmetic.",
	"I'm preparing for an exam, so show me the derivations.",
	"I learn best with real-world examples and pictures.",
	"English is my second language. Please keep sentences simple.",
	"I already know calculus. Don't re-explain the basics.",
] as const;

/** One option card in a single-choice grid. */
function OptionCard({
	selected,
	label,
	hint,
	onClick,
	testid,
}: {
	selected: boolean;
	label: string;
	hint: string;
	onClick: () => void;
	testid: string;
}) {
	return (
		<SelectableCard label={label} isSelected={selected} onChange={() => onClick()} padding={3} data-testid={testid}>
			<VStack gap={0.5}>
				<Text type="body">{label}</Text>
				<Text type="supporting">{hint}</Text>
			</VStack>
		</SelectableCard>
	);
}

function ChoiceGrid<T extends string>({
	label,
	options,
	meta,
	value,
	onChange,
	columns,
	testid,
}: {
	label: string;
	options: readonly T[];
	meta: Record<T, { label: string; hint: string }>;
	value: T | undefined;
	onChange: (next: T | undefined) => void;
	columns: string;
	testid: string;
}) {
	return (
		<div role="radiogroup" aria-label={label} data-testid={testid} className={cn("grid gap-2", columns)}>
			{options.map((o) => (
				<OptionCard
					key={o}
					testid={`${testid}-${o}`}
					selected={value === o}
					label={meta[o].label}
					hint={meta[o].hint}
					// Clicking the selected card clears it — every field is optional.
					onClick={() => onChange(value === o ? undefined : o)}
				/>
			))}
		</div>
	);
}

export function LevelPicker({ value, onChange }: { value: LearnerSettings["level"]; onChange: (v: LearnerSettings["level"]) => void }) {
	return (
		<ChoiceGrid
			label="Your level"
			options={LEARNER_LEVELS}
			meta={LEARNER_LEVEL_META}
			value={value}
			onChange={onChange}
			columns="grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
			testid="learner-level"
		/>
	);
}

export function MathPicker({ value, onChange }: { value: LearnerSettings["math"]; onChange: (v: LearnerSettings["math"]) => void }) {
	return (
		<ChoiceGrid
			label="How much math"
			options={LEARNER_MATH}
			meta={LEARNER_MATH_META}
			value={value}
			onChange={onChange}
			columns="grid-cols-1 sm:grid-cols-2"
			testid="learner-math"
		/>
	);
}

export function StylePicker({ value, onChange }: { value: LearnerSettings["style"]; onChange: (v: LearnerSettings["style"]) => void }) {
	return (
		<ChoiceGrid
			label="Explanation style"
			options={LEARNER_STYLES}
			meta={LEARNER_STYLE_META}
			value={value}
			onChange={onChange}
			columns="grid-cols-1 sm:grid-cols-3"
			testid="learner-style"
		/>
	);
}

export function NotesField({
	value,
	onChange,
	onCommit,
	rows = 6,
}: {
	value: string;
	onChange: (v: string) => void;
	/** Fired with the final text on blur and after an example is added. */
	onCommit?: (v: string) => void;
	rows?: number;
}) {
	const append = (line: string) => {
		const base = value.trimEnd();
		const next = (base ? `${base}\n${line}` : line).slice(0, LEARNER_NOTES_MAX);
		onChange(next);
		onCommit?.(next);
	};
	// Speak instead of typing: the app's dictation engine, with this box
	// claiming the transcript while it is mounted. Refs keep the append
	// stable so the claim never churns.
	const latest = useRef({ value, onChange, onCommit });
	latest.current = { value, onChange, onCommit };
	const appendSpoken = useCallback((text: string) => {
		const { value: current, onChange: change, onCommit: commit } = latest.current;
		const next = joinDictation(current, text).slice(0, LEARNER_NOTES_MAX);
		change(next);
		commit?.(next);
	}, []);
	const dictation = useDictation({ append: appendSpoken });
	useDictationTarget(appendSpoken, true);
	return (
		<div className="flex flex-col gap-3">
			<div className="relative">
			<textarea
				value={value}
				onChange={(e) => onChange(e.target.value.slice(0, LEARNER_NOTES_MAX))}
				onBlur={() => onCommit?.(value)}
				rows={rows}
				maxLength={LEARNER_NOTES_MAX}
				aria-label="Notes for your tutor"
				data-testid="learner-notes"
				placeholder="Type, or tap the mic and just talk. For example: I'm in 6th grade. Explain with everyday examples and keep the math simple."
				className="w-full resize-y rounded-lg border border-strong bg-surface px-4 pt-3 pb-12 text-[15px] leading-relaxed text-primary outline-none placeholder:text-secondary focus:border-accent-bg"
			/>
			<div className="absolute bottom-2 right-2 flex items-center gap-1">
				{dictation.active ? (
					<span className="text-[13px] text-secondary">Listening… tap to stop</span>
				) : (
					<span className="text-[13px] text-secondary/70">Speak it out loud</span>
				)}
				<DictationMeter dictation={dictation} />
				<DictationButton dictation={dictation} />
			</div>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{NOTE_EXAMPLES.filter((ex) => !value.includes(ex)).map((ex) => (
					<Button key={ex} label={ex} size="sm" variant="secondary" icon={<PlusIcon className="size-3.5" />} onClick={() => append(ex)} />
				))}
			</div>
			<span className="self-end text-xs text-secondary/70">
				{value.length}/{LEARNER_NOTES_MAX}
			</span>
		</div>
	);
}

/** PUT the whole learner section; ok or a human error line. */
export async function saveLearner(next: LearnerSettings): Promise<{ ok: true } | { ok: false; error: string }> {
	const res = await fetch("/api/settings/learner", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(next),
	}).catch(() => null);
	if (!res) return { ok: false, error: "Could not save. Check your connection and try again." };
	if (!res.ok) {
		const detail = (await res.json().catch(() => ({}))) as { error?: string };
		return { ok: false, error: detail.error ?? `Save failed (${res.status})` };
	}
	return { ok: true };
}
