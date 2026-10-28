/**
 * FIRST-RUN ONBOARDING: a short walk through what Kapany is and how a
 * lesson runs, then the learner profile (level, math, style, free notes).
 * The profile is appended to every tutor prompt (engine core/learner.ts).
 *
 * Shows once — until the learner finishes or skips, which stores
 * `learner.onboarded = true`. Settings → Learner can replay it by
 * dispatching OPEN_ONBOARDING_EVENT.
 */

import { List, ListItem } from "@astryxdesign/core/List";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import {
	BrainCircuitIcon,
	CheckIcon,
	ListTreeIcon,
	MessageCircleQuestionIcon,
	NetworkIcon,
	PencilLineIcon,
	TargetIcon,
} from "lucide-react";
import type { LearnerSettings, UserSettings } from "@/src/core";
import { notifySettingsSaved } from "@/components/settings-signal";
import { isDictationActive } from "@/components/dictation";
import { LevelPicker, MathPicker, NotesField, StylePicker, saveLearner } from "@/components/learner-profile";
import { cn } from "@/lib/utils";

export const OPEN_ONBOARDING_EVENT = "lh:open-onboarding";

/** Replay the onboarding from anywhere (Settings → Learner). */
export function openOnboarding(): void {
	window.dispatchEvent(new CustomEvent(OPEN_ONBOARDING_EVENT));
}

const STEPS = ["welcome", "lesson", "level", "style", "notes"] as const;
type Step = (typeof STEPS)[number];

/** Mounted once in the AppShell: fetches the record, opens when the
 *  learner has not been onboarded yet, and on the replay event. */
export function OnboardingGate() {
	const [initial, setInitial] = useState<LearnerSettings | null>(null);
	const [show, setShow] = useState(false);

	const load = useCallback((force: boolean) => {
		fetch("/api/settings", { cache: "no-store" })
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
			.then((body: { settings: UserSettings | null }) => {
				const learner = body.settings?.learner ?? {};
				setInitial(learner);
				if (force || !learner.onboarded) setShow(true);
			})
			// Server unreachable: stay out of the way rather than block the app.
			.catch(() => {});
	}, []);

	useEffect(() => load(false), [load]);
	useEffect(() => {
		const onOpen = () => load(true);
		window.addEventListener(OPEN_ONBOARDING_EVENT, onOpen);
		return () => window.removeEventListener(OPEN_ONBOARDING_EVENT, onOpen);
	}, [load]);

	if (!show || initial === null) return null;
	return <Onboarding initial={initial} onClose={() => setShow(false)} />;
}

function Onboarding({ initial, onClose }: { initial: LearnerSettings; onClose: () => void }) {
	const [step, setStep] = useState<Step>("welcome");
	const [profile, setProfile] = useState<LearnerSettings>(initial);
	const [notes, setNotes] = useState(initial.notes ?? "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const index = STEPS.indexOf(step);
	const last = index === STEPS.length - 1;

	const finish = useCallback(async () => {
		setSaving(true);
		setError(null);
		const next: LearnerSettings = { ...profile, onboarded: true };
		const trimmed = notes.trim();
		if (trimmed) next.notes = notes;
		else delete next.notes;
		const result = await saveLearner(next);
		setSaving(false);
		if (!result.ok) {
			setError(result.error);
			return;
		}
		notifySettingsSaved("learner");
		onClose();
	}, [profile, notes, onClose]);

	// Esc = skip for now (keeps whatever was picked, never shows again).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			// Esc while dictating cancels the dictation, not the onboarding.
			if (isDictationActive()) return;
			e.preventDefault();
			e.stopPropagation();
			void finish();
		};
		// Window capture runs before the document-level listeners, so a
		// replay opened over Settings closes only this layer.
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [finish]);

	const next = () => (last ? void finish() : setStep(STEPS[index + 1]!));
	const back = () => index > 0 && setStep(STEPS[index - 1]!);

	// Astryx Dialog, purpose "required": Esc is handled above (skip for
	// now), and a backdrop click never dismisses mid-onboarding.
	return (
		<Dialog isOpen onOpenChange={() => {}} purpose="required" width={760} maxHeight="92dvh" padding={0} aria-label="Welcome to Kapany">
			<div data-testid="onboarding" className="flex h-[min(640px,92dvh)] flex-col">
				{/* Progress */}
				<div className="flex items-center gap-1.5 px-6 pt-5 sm:px-8" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
					{STEPS.map((s, i) => (
						<span
							key={s}
							className={cn("h-1 flex-1 rounded-full transition-colors", i <= index ? "bg-accent-bg" : "bg-overlay-hover")}
						/>
					))}
				</div>

				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6 sm:px-8" data-testid={`onboarding-step-${step}`}>
					{step === "welcome" && <WelcomeStep />}
					{step === "lesson" && <LessonStep />}
					{step === "level" && (
						<StepFrame
							title="Where are you in your learning?"
							lead="This sets how advanced explanations can get. A middle-schooler asking about circuits gets charge and energy, not vector calculus."
						>
							<LevelPicker value={profile.level} onChange={(level) => setProfile((p) => ({ ...p, level }))} />
						</StepFrame>
					)}
					{step === "style" && (
						<StepFrame title="How do you like things explained?" lead="Pick what fits. You can change it any time in Settings.">
							<h3 className="mb-2 text-sm text-secondary">How much math</h3>
							<MathPicker value={profile.math} onChange={(math) => setProfile((p) => ({ ...p, math }))} />
							<h3 className="mb-2 mt-6 text-sm text-secondary">Explanation style</h3>
							<StylePicker value={profile.style} onChange={(style) => setProfile((p) => ({ ...p, style }))} />
						</StepFrame>
					)}
					{step === "notes" && (
						<StepFrame
							title="Anything else your tutor should know?"
							lead="Type it or just say it out loud: your grade, what you're studying for, what you already know, or how you like to learn. Your tutor reads this before every lesson."
						>
							<NotesField value={notes} onChange={setNotes} />
						</StepFrame>
					)}
				</div>

				<footer className="flex items-center gap-3 border-t border-border px-6 py-4 sm:px-8">
					{index > 0 ? <Button label="Back" variant="ghost" onClick={back} /> : <span />}
					{error && <p className="text-sm text-error">{error}</p>}
					<HStack gap={2} align="center" className="ml-auto">
						{!last && (
							<Button data-testid="onboarding-skip" label="Skip for now" variant="ghost" isDisabled={saving} onClick={() => void finish()} />
						)}
						<Button
							data-testid="onboarding-next"
							variant="primary"
							label={last ? "Start learning" : index === 0 ? "Get started" : "Continue"}
							isLoading={saving}
							endContent={last ? <Icon icon={CheckIcon} /> : undefined}
							onClick={next}
						/>
					</HStack>
				</footer>
			</div>
		</Dialog>
	);
}

function StepFrame({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
	return (
		<div>
			<h2 className="font-title text-2xl tracking-tight text-primary sm:text-3xl">{title}</h2>
			<p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-secondary">{lead}</p>
			<div className="mt-6">{children}</div>
		</div>
	);
}

function WelcomeStep() {
	return (
		<div className="flex flex-1 flex-col justify-center pb-6">
			<span className="font-brand text-sm font-semibold tracking-wide text-secondary">KAPANY</span>
			<h2 className="mt-3 font-title text-3xl tracking-tight text-primary sm:text-4xl">
				A tutor that finds where your understanding ends, and teaches from there.
			</h2>
			<p className="mt-4 max-w-[58ch] text-[16px] leading-relaxed text-secondary">
				Most AI tutors just explain. Kapany first checks what you already understand, plans a path from there to
				your goal, and teaches one step at a time. Two people asking the same question get two different lessons.
			</p>
			<p className="mt-4 max-w-[58ch] text-[16px] leading-relaxed text-secondary">
				The next minute shows how a lesson works, then asks a little about you so lessons fit your level.
			</p>
		</div>
	);
}

const LESSON_STAGES = [
	{
		Icon: TargetIcon,
		title: "Measure",
		body: "Before teaching, the tutor asks about the ideas your goal depends on. Your answers and confidence show where your understanding ends.",
	},
	{
		Icon: ListTreeIcon,
		title: "Plan",
		body: "It builds a visible map from what you know to your goal. You can see the plan in the session and it changes when your answers surprise it.",
	},
	{
		Icon: BrainCircuitIcon,
		title: "Teach",
		body: "Each step builds on something you already hold. You predict, get an explanation, then check your understanding with a question.",
	},
	{
		Icon: NetworkIcon,
		title: "Remember",
		body: "What you learn lands in your knowledge graph on the home screen. Later lessons and practice sessions build on it.",
	},
] as const;

function LessonStep() {
	return (
		<StepFrame title="How a lesson works" lead="Type what you want to learn on the home screen. From there, every lesson follows the same loop.">
			<List hasDividers>
				{LESSON_STAGES.map(({ Icon: StageIcon, title, body }, i) => (
					<ListItem key={title} align="start" startContent={<StageIcon className="size-5 text-secondary" aria-hidden />} label={`${i + 1}. ${title}`} description={body} />
				))}
			</List>
			<div className="mt-4 grid gap-3 sm:grid-cols-2">
				<Tip Icon={PencilLineIcon} title="Think out loud">
					Every question has a thinking field. Write or dictate your reasoning and doubts: it tells the tutor how you
					think, not only whether you were right.
				</Tip>
				<Tip Icon={MessageCircleQuestionIcon} title="Say how sure you are">
					Rating your confidence on each answer helps the tutor tell a lucky guess from real understanding.
				</Tip>
			</div>
		</StepFrame>
	);
}

function Tip({ Icon, title, children }: { Icon: typeof TargetIcon; title: string; children: React.ReactNode }) {
	return (
		<div className="flex gap-3 rounded-lg p-1">
			<Icon className="mt-0.5 size-[18px] shrink-0 text-secondary" aria-hidden />
			<span>
				<span className="block text-[15px] text-primary">{title}</span>
				<span className="mt-1 block text-[14px] leading-relaxed text-secondary">{children}</span>
			</span>
		</div>
	);
}
