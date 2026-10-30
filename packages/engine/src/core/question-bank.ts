/**
 * THE QUESTION BANK (2026-10-30): exam questions imported from outside
 * (data/question-bank/<bank>/questions.jsonl — the Hudjee export, the
 * Allen STAR sheets). Pure: the row shape, the search the find_questions
 * tool runs, and the text it returns. Loading lives in the store
 * (src/store/question-bank.ts); the tools in src/agent/tools/question-bank.ts.
 */

export type BankExam = "jee_main" | "jee_advanced";
export type BankDifficulty = "easy" | "medium" | "hard";
export type BankFormat = "mcq_single" | "mcq_multi" | "integer" | "numerical" | "passage" | "matrix";

export interface BankOption {
	id: string;
	text: string;
}

/** Matrix-match options: two columns, answers map each left id to right ids. */
export interface BankMatrix {
	type: "matrix";
	left: BankOption[];
	right: BankOption[];
}

export interface BankQuestion {
	id: string;
	/** The id inside its source ("pyq:…", "allen:…") — the dedupe key across banks. */
	sourceRef: string;
	subject: string;
	chapter: string | null;
	topic: string | null;
	format: BankFormat;
	/** Null = not a past-paper question (coaching sheet, textbook). */
	exam: BankExam | null;
	year: number | null;
	difficulty: BankDifficulty | null;
	body: string;
	options: BankOption[] | BankMatrix | null;
	/** Option ids (mcq/passage), a left→right map (matrix), or the exact value. */
	answer: string[] | Record<string, string[]> | string;
	solution: string | null;
	/** False when the solution is only "Answer: C". */
	hasWorkedSolution: boolean;
}

export interface BankQuery {
	subject?: string;
	chapter?: string;
	topic?: string;
	/** Words that must all appear in the question text. */
	text?: string;
	/** "none" = only questions that are not from a past paper. */
	exam?: BankExam | "none";
	format?: BankFormat;
	difficulty?: BankDifficulty;
	/** Question ids to leave out (already used). */
	exclude?: string[];
	limit?: number;
}

export const BANK_DEFAULT_LIMIT = 3;
export const BANK_MAX_LIMIT = 10;
/** Long worked solutions are cut here in tool output. */
export const BANK_SOLUTION_CAP = 2500;

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();

/** Turn one questions.jsonl row into a BankQuestion; null when it has no
 *  answer (a question the tutor can't grade is no use). */
export function bankQuestionFromRow(row: Record<string, unknown>): BankQuestion | null {
	const answer = row.answer as BankQuestion["answer"] | null | undefined;
	if (answer === null || answer === undefined || answer === "") return null;
	const id = String(row.id);
	return {
		id,
		sourceRef: typeof row.source_ref === "string" && row.source_ref ? row.source_ref : id,
		subject: String(row.subject ?? ""),
		chapter: (row.chapter as string | null) ?? null,
		topic: (row.topic as string | null) ?? null,
		format: row.format as BankFormat,
		exam: (row.exam as BankExam | null) ?? null,
		year: typeof row.year === "number" ? row.year : null,
		difficulty: (row.difficulty as BankDifficulty | null) ?? null,
		body: String(row.question_body ?? row.body ?? ""),
		options: (row.options as BankQuestion["options"]) ?? null,
		answer,
		solution: (row.solution as string | null) || null,
		hasWorkedSolution:
			typeof row.has_worked_solution === "boolean"
				? row.has_worked_solution
				: typeof row.solution === "string" && row.solution !== "" && !row.solution.startsWith("Answer:"),
	};
}

/** Every question matching the query, in bank order. */
export function matchQuestions(bank: readonly BankQuestion[], query: BankQuery): BankQuestion[] {
	const subject = norm(query.subject);
	const chapter = norm(query.chapter);
	const topic = norm(query.topic);
	const words = norm(query.text).split(/\s+/).filter(Boolean);
	const exclude = new Set(query.exclude ?? []);
	return bank.filter((q) => {
		if (exclude.has(q.id)) return false;
		if (subject && norm(q.subject) !== subject) return false;
		if (chapter && !norm(q.chapter).includes(chapter)) return false;
		if (topic && !norm(q.topic).includes(topic)) return false;
		if (query.exam === "none" ? q.exam !== null : query.exam && q.exam !== query.exam) return false;
		if (query.format && q.format !== query.format) return false;
		if (query.difficulty && q.difficulty !== query.difficulty) return false;
		if (words.length > 0) {
			const body = norm(q.body);
			if (!words.every((w) => body.includes(w))) return false;
		}
		return true;
	});
}

/** A random sample of `limit` matches (so repeated calls vary), plus the
 *  total match count. `random` is injectable for tests. */
export function searchQuestions(
	bank: readonly BankQuestion[],
	query: BankQuery,
	random: () => number = Math.random,
): { total: number; questions: BankQuestion[] } {
	const matches = matchQuestions(bank, query);
	const limit = Math.max(1, Math.min(BANK_MAX_LIMIT, query.limit ?? BANK_DEFAULT_LIMIT));
	const pool = [...matches];
	const picked: BankQuestion[] = [];
	while (picked.length < limit && pool.length > 0) {
		const i = Math.floor(random() * pool.length);
		picked.push(pool.splice(i, 1)[0]!);
	}
	return { total: matches.length, questions: picked };
}

/** Chapters (with their topics and counts) for one subject, or the
 *  subjects themselves when none is given. */
export function bankOutline(bank: readonly BankQuestion[], subject?: string): string {
	if (bank.length === 0) return "The question bank is empty.";
	if (!subject) {
		const subjects = new Map<string, number>();
		for (const q of bank) subjects.set(q.subject, (subjects.get(q.subject) ?? 0) + 1);
		return (
			`${bank.length} questions. Subjects:\n` +
			[...subjects].map(([s, n]) => `- ${s} (${n})`).join("\n") +
			"\nPass a subject to see its chapters and topics."
		);
	}
	const chapters = new Map<string, Map<string, number>>();
	let count = 0;
	for (const q of bank) {
		if (norm(q.subject) !== norm(subject)) continue;
		count++;
		const ch = q.chapter ?? "(no chapter)";
		const topics = chapters.get(ch) ?? new Map<string, number>();
		const tp = q.topic ?? "(no topic)";
		topics.set(tp, (topics.get(tp) ?? 0) + 1);
		chapters.set(ch, topics);
	}
	if (count === 0) return `No questions for subject "${subject}". Call without a subject to list them.`;
	const lines = [...chapters]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([ch, topics]) => {
			const n = [...topics.values()].reduce((a, b) => a + b, 0);
			const list = [...topics].sort(([a], [b]) => a.localeCompare(b)).map(([t, k]) => `${t} (${k})`).join("; ");
			return `- ${ch} (${n}): ${list}`;
		});
	return `${count} ${subject} questions in ${chapters.size} chapters:\n${lines.join("\n")}`;
}

/** "opt-3" → "3" for display. */
const optLabel = (id: string) => id.replace(/^opt-/, "");

function formatOptions(options: BankQuestion["options"]): string[] {
	if (!options) return [];
	if (Array.isArray(options)) return options.map((o) => `(${optLabel(o.id)}) ${o.text}`);
	return [
		"Column I:",
		...options.left.map((o) => `  (${o.id}) ${o.text}`),
		"Column II:",
		...options.right.map((o) => `  (${o.id}) ${o.text}`),
	];
}

function formatAnswer(answer: BankQuestion["answer"]): string {
	if (typeof answer === "string") return answer;
	if (Array.isArray(answer)) return answer.map(optLabel).join(", ");
	return Object.entries(answer)
		.map(([left, right]) => `${left} → ${right.join(", ")}`)
		.join("; ");
}

/** One question as the tool returns it: header, text, options, answer, solution. */
export function formatBankQuestion(q: BankQuestion): string {
	const source = q.exam ? `${q.exam === "jee_main" ? "JEE Main" : "JEE Advanced"}${q.year ? ` ${q.year}` : ""}` : "practice sheet";
	const where = [q.subject, q.chapter, q.topic].filter(Boolean).join(" › ");
	const header = `[${q.id}] ${source} · ${where} · ${q.format}${q.difficulty ? ` · ${q.difficulty}` : ""}`;
	let solution = q.solution ?? "";
	if (solution.length > BANK_SOLUTION_CAP) solution = `${solution.slice(0, BANK_SOLUTION_CAP)} […]`;
	return [
		header,
		q.body,
		...formatOptions(q.options),
		`Answer: ${formatAnswer(q.answer)}`,
		q.hasWorkedSolution ? `Solution:\n${solution}` : "Solution: none in the bank (answer key only).",
	].join("\n");
}
