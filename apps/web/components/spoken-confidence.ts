/**
 * Spoken confidence: read how sure the learner SAYS they are out of one
 * dictated sentence, so hands-free voice can set the confidence slider.
 *
 * Two kinds of evidence, checked in order:
 *   1. A number — "70 percent", "70%", "seventy percent", "seven out of
 *      ten". To keep reasoning like "half the charge, 50 percent of it"
 *      from moving the slider, a number counts only when the sentence also
 *      talks about certainty (sure, confident, certain, chance, likely…)
 *      or is short enough to be just the answer ("about seventy percent").
 *   2. A phrase — "completely sure", "pretty confident", "fifty-fifty",
 *      "not very sure". Negated forms are checked before plain ones.
 *
 * Returns the percent (0–100) to snap onto the slider's stops, or null.
 * Pure — unit-tested in tests/spoken-confidence.test.ts.
 */

const NUMBER_WORDS: Record<string, number> = {
	zero: 0,
	ten: 10,
	twenty: 20,
	thirty: 30,
	forty: 40,
	fifty: 50,
	sixty: 60,
	seventy: 70,
	eighty: 80,
	ninety: 90,
	hundred: 100,
	"a hundred": 100,
	"one hundred": 100,
};

const SMALL_WORDS: Record<string, number> = {
	zero: 0,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
};

const CERTAINTY = /\b(sure|confident|confidence|certain|certainty|chance|likely|odds|bet)\b/;
/** "about seventy percent" — short enough to be the answer itself. */
const SHORT_SENTENCE_WORDS = 6;

/** Phrases, most specific first (negations before the plain forms). */
const PHRASES: [RegExp, number][] = [
	[/\bnot (at all|even a little) (sure|confident|certain)\b/, 0],
	[/\b(not (very|that|really|too|so) (sure|confident|certain)|not (sure|confident) at all|not confident|unsure|probably not|i doubt)\b/, 30],
	[/\b(just|pure|total|wild) guess(ing)?\b|\bi'?m guessing\b/, 30],
	[/\b(fifty[- ]fifty|50[- ]50|coin ?flip|toss[- ]up|half sure|not sure)\b/, 50],
	[/\b(completely|totally|absolutely|one hundred percent|a hundred percent|hundred percent|100%|100 percent) (sure|certain|confident)\b|\bi'?m certain\b|\bi am certain\b/, 100],
	[/\b(very|really|quite|super|extremely) (sure|confident)\b/, 90],
	[/\b(pretty|fairly|reasonably|mostly|somewhat) (sure|confident)\b/, 70],
];

/** Normalise speech-to-text output: lower case, unify apostrophes. */
function normalise(text: string): string {
	return text.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
}

/** A spoken or written number + "percent"/"%", or "N out of ten". */
function findNumber(t: string): number | null {
	const digits = t.match(/\b(\d{1,3})\s*(%|percent|per cent)/);
	if (digits) return Number(digits[1]);
	const words = t.match(/\b(a hundred|one hundred|zero|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[- ](one|two|three|four|five|six|seven|eight|nine))?\s*(percent|per cent)\b/);
	if (words) return (NUMBER_WORDS[words[1]!] ?? 0) + (words[2] ? (SMALL_WORDS[words[2]] ?? 0) : 0);
	const outOfTen = t.match(/\b(\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten) out of (10|ten)\b/);
	if (outOfTen) {
		const n = /\d/.test(outOfTen[1]!) ? Number(outOfTen[1]) : (SMALL_WORDS[outOfTen[1]!] ?? 0);
		return n * 10;
	}
	return null;
}

export function parseSpokenConfidence(text: string): number | null {
	const t = normalise(text);
	if (!t) return null;
	const n = findNumber(t);
	if (n !== null && n >= 0 && n <= 100) {
		const short = t.split(" ").length <= SHORT_SENTENCE_WORDS;
		if (short || CERTAINTY.test(t)) return n;
	}
	for (const [re, value] of PHRASES) if (re.test(t)) return value;
	return null;
}

/** Index of the stop nearest to a percent. */
export function nearestStop(stops: readonly number[], percent: number): number {
	let best = 0;
	for (let i = 1; i < stops.length; i++) {
		if (Math.abs(stops[i]! - percent) < Math.abs(stops[best]! - percent)) best = i;
	}
	return best;
}
