/**
 * THE LEARNER PROFILE: who the learner is and how they like to be taught,
 * collected by the first-run onboarding and editable in Settings → Learner.
 *
 * It lives in the settings record as its own `learner` section. Every
 * teaching agent (prober, teacher, practice) gets it appended to its system
 * prompt as one "About this learner" block, so a 6th grader asking about
 * Kirchhoff's law is never handed curl and divergence, and a learner who
 * wants rigor is not given only hand-waving.
 *
 * Browser-safe: pure logic + types, no node imports.
 */

/** How far along in school or work the learner is. */
export const LEARNER_LEVELS = [
	"primary",
	"middle",
	"high",
	"undergrad",
	"graduate",
	"professional",
] as const;
export type LearnerLevel = (typeof LEARNER_LEVELS)[number];

/** How much mathematics the learner wants in explanations. */
export const LEARNER_MATH = ["none", "light", "standard", "rigorous"] as const;
export type LearnerMath = (typeof LEARNER_MATH)[number];

/** The shape of explanations: pictures and words, a mix, or formal. */
export const LEARNER_STYLES = ["intuitive", "balanced", "formal"] as const;
export type LearnerStyle = (typeof LEARNER_STYLES)[number];

/** Free-text notes cap — the block rides in every system prompt. */
export const LEARNER_NOTES_MAX = 2000;

export interface LearnerSettings {
	/** True once the learner finished (or skipped) the onboarding. */
	onboarded?: boolean;
	level?: LearnerLevel;
	math?: LearnerMath;
	style?: LearnerStyle;
	/** Anything else the tutor should know, in the learner's own words. */
	notes?: string;
}

/** UI labels + short descriptions, shared by onboarding and Settings. */
export const LEARNER_LEVEL_META: Record<LearnerLevel, { label: string; hint: string }> = {
	primary: { label: "Primary school", hint: "Around ages 6–10" },
	middle: { label: "Middle school", hint: "Around grades 6–8" },
	high: { label: "High school", hint: "Around grades 9–12" },
	undergrad: { label: "University", hint: "Undergraduate study" },
	graduate: { label: "Graduate", hint: "Master's, PhD, research" },
	professional: { label: "Working professional", hint: "Learning for work or curiosity" },
};

export const LEARNER_MATH_META: Record<LearnerMath, { label: string; hint: string }> = {
	none: { label: "No equations", hint: "Words, pictures and examples only" },
	light: { label: "A little", hint: "Simple arithmetic and basic formulas" },
	standard: { label: "Where it helps", hint: "Equations when they make things clearer" },
	rigorous: { label: "Full math", hint: "Derivations, notation and proofs" },
};

export const LEARNER_STYLE_META: Record<LearnerStyle, { label: string; hint: string }> = {
	intuitive: { label: "Intuition first", hint: "Analogies, stories, the feel of why" },
	balanced: { label: "Balanced", hint: "Intuition, then the precise version" },
	formal: { label: "Formal and precise", hint: "Definitions and exact statements" },
};

/** What each level means for the tutor — the hard ceiling on vocabulary
 *  and prerequisites. */
const LEVEL_GUIDANCE: Record<LearnerLevel, string> = {
	primary:
		"A primary-school child (roughly ages 6–10). Use short sentences, everyday words and concrete objects they can picture. Assume only basic counting, addition and subtraction. Never use algebra, symbols, or technical jargon.",
	middle:
		"A middle-school student (roughly grades 6–8). Assume arithmetic, fractions, decimals, simple ratios, and at most a first taste of algebra (solving for one unknown). Do NOT use calculus, vectors, vector calculus (curl, divergence, gradient), complex numbers, or university-level physics formalism — even when that is how experts state the topic. Explain the topic at the level a good middle-school teacher would.",
	high:
		"A high-school student (roughly grades 9–12). Assume algebra, geometry, basic trigonometry and functions; calculus only at an introductory level and only if it clearly helps. Avoid vector calculus, linear algebra formalism and other university machinery unless the learner asks for it.",
	undergrad:
		"A university undergraduate. Single- and multi-variable calculus, linear algebra and standard first/second-year science are fair game, but check prerequisites with the probe rather than assuming them.",
	graduate:
		"A graduate student or researcher. Advanced mathematics and field-specific formalism are fine; skip the basics they clearly hold and go deep.",
	professional:
		"A working professional. They are an adult learner; do not assume recent school mathematics — probe for it. Favor practical relevance and real-world examples.",
};

const MATH_GUIDANCE: Record<LearnerMath, string> = {
	none: "Avoid equations and symbolic notation entirely. Explain with words, analogies, pictures and worked examples using plain numbers at most.",
	light: "Keep math light: simple arithmetic and the occasional named formula, each explained in words. No derivations.",
	standard: "Use equations where they make an idea clearer, always paired with a plain-language reading of what they say.",
	rigorous: "They want the mathematics: state things precisely, derive results step by step, and use proper notation. Do not hand-wave when a derivation is within reach of their level.",
};

const STYLE_GUIDANCE: Record<LearnerStyle, string> = {
	intuitive: "Lead with intuition: analogies, physical pictures, and why it has to be so. Formal statements come only after the idea already feels obvious, and only if needed.",
	balanced: "Build the intuition first, then give the precise version so they hold both.",
	formal: "Prefer exact definitions and precise statements; use intuition to support the formal version, not replace it.",
};

/** Is there anything worth telling the tutor? */
export function hasLearnerContext(learner: LearnerSettings | undefined): boolean {
	return Boolean(learner && (learner.level || learner.math || learner.style || learner.notes?.trim()));
}

/**
 * The prompt block appended to every teaching agent's system prompt, or ""
 * when the learner told us nothing. The learner's own notes are quoted as
 * data, not as instructions that outrank the teaching method.
 */
export function composeLearnerContext(learner: LearnerSettings | undefined): string {
	if (!learner || !hasLearnerContext(learner)) return "";
	const lines: string[] = [
		"# About this learner",
		"",
		"The learner described themselves during onboarding. Fit EVERY explanation, question, example and plan to this profile. It sets the ceiling on vocabulary, notation and assumed prerequisites: if the textbook treatment of a topic needs tools above this level, teach the version that fits the level instead (for example, Kirchhoff's laws for a middle-schooler are about charge and energy being conserved around a loop, not about curl or divergence).",
	];
	if (learner.level) lines.push("", `**Level:** ${LEVEL_GUIDANCE[learner.level]}`);
	if (learner.math) lines.push("", `**Mathematics:** ${MATH_GUIDANCE[learner.math]}`);
	if (learner.style) lines.push("", `**Explanation style:** ${STYLE_GUIDANCE[learner.style]}`);
	const notes = learner.notes?.trim();
	if (notes) {
		lines.push(
			"",
			"**In their own words** (preferences and background; honor them unless they conflict with accuracy):",
			"",
			...notes.slice(0, LEARNER_NOTES_MAX).split("\n").map((l) => `> ${l}`),
		);
	}
	lines.push(
		"",
		"If the learner's answers show this profile is off (they are clearly more or less advanced than stated), adapt to what you observe in this session.",
	);
	return lines.join("\n");
}

/** Read-side sanitizer: lenient, drops anything malformed. */
export function sanitizeLearner(raw: unknown): LearnerSettings | undefined {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
	const r = raw as Record<string, unknown>;
	const out: LearnerSettings = {};
	if (typeof r.onboarded === "boolean") out.onboarded = r.onboarded;
	if ((LEARNER_LEVELS as readonly unknown[]).includes(r.level)) out.level = r.level as LearnerLevel;
	if ((LEARNER_MATH as readonly unknown[]).includes(r.math)) out.math = r.math as LearnerMath;
	if ((LEARNER_STYLES as readonly unknown[]).includes(r.style)) out.style = r.style as LearnerStyle;
	if (typeof r.notes === "string" && r.notes.trim()) out.notes = r.notes.slice(0, LEARNER_NOTES_MAX);
	return out;
}

/** Write-side parser: strict (a bad value is a 400 with the reason). */
export function parseLearnerBody(
	body: unknown,
): { ok: true; settings: LearnerSettings } | { ok: false; error: string } {
	if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Invalid JSON body" };
	const raw = body as Record<string, unknown>;
	const out: LearnerSettings = {};
	if (raw.onboarded !== undefined) {
		if (typeof raw.onboarded !== "boolean") return { ok: false, error: "onboarded must be a boolean" };
		out.onboarded = raw.onboarded;
	}
	const pick = <T extends string>(field: string, value: unknown, allowed: readonly T[]) => {
		if (value === undefined || value === null) return { ok: true as const };
		if (!(allowed as readonly unknown[]).includes(value)) {
			return { ok: false as const, error: `${field} must be one of: ${allowed.join(", ")}` };
		}
		return { ok: true as const, value: value as T };
	};
	const level = pick("level", raw.level, LEARNER_LEVELS);
	if (!level.ok) return level;
	if (level.value) out.level = level.value;
	const math = pick("math", raw.math, LEARNER_MATH);
	if (!math.ok) return math;
	if (math.value) out.math = math.value;
	const style = pick("style", raw.style, LEARNER_STYLES);
	if (!style.ok) return style;
	if (style.value) out.style = style.value;
	if (raw.notes !== undefined && raw.notes !== null) {
		if (typeof raw.notes !== "string") return { ok: false, error: "notes must be a string" };
		if (raw.notes.length > LEARNER_NOTES_MAX) {
			return { ok: false, error: `notes must be at most ${LEARNER_NOTES_MAX} characters` };
		}
		if (raw.notes.trim()) out.notes = raw.notes;
	}
	return { ok: true, settings: out };
}
