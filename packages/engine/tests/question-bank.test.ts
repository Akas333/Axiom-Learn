/**
 * THE QUESTION BANK (2026-10-30): row parsing, search filters and
 * sampling, the text the tool returns, the store's load + dedupe across
 * banks, and registration on the prober, teacher and practice registries.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";

import {
	bankOutline,
	bankQuestionFromRow,
	formatBankQuestion,
	matchQuestions,
	searchQuestions,
	type BankQuestion,
} from "../src/core/question-bank.ts";
import { questionBankTools } from "../src/agent/tools/question-bank.ts";
import { practiceTools } from "../src/agent/tools/practice.ts";
import { PATHS } from "../config.ts";
import { loadQuestionBank, questionBankAvailable } from "../src/store/question-bank.ts";

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: "q1",
		source_ref: "pyq:2024:1",
		subject: "physics",
		chapter: "Current Electricity",
		topic: "Kirchhoff's Laws",
		format: "mcq_single",
		exam: "jee_main",
		year: 2024,
		difficulty: "medium",
		body: "Find the current through the 2 ohm resistor.",
		options: [
			{ id: "opt-1", text: "1 A" },
			{ id: "opt-2", text: "2 A" },
		],
		answer: ["opt-2"],
		solution: "Apply KVL around the loop: 4 = 2I, so I = 2 A.",
		has_worked_solution: true,
		...over,
	};
}

const q = (over: Record<string, unknown> = {}) => bankQuestionFromRow(row(over))!;

const BANK: BankQuestion[] = [
	q(),
	q({ id: "q2", source_ref: "pyq:2023:5", year: 2023, difficulty: "hard", body: "A wire of resistance R is stretched." }),
	q({ id: "q3", source_ref: "allen:1", exam: null, year: null, chapter: "Capacitor", topic: "Capacitance", format: "integer", options: null, answer: "4", solution: "Answer: 4", has_worked_solution: false }),
	q({ id: "q4", source_ref: "pyq:2022:9", subject: "chemistry", chapter: "P Block", topic: "Group 15", exam: "jee_advanced" }),
];

describe("question bank rows", () => {
	it("drops rows with no answer and keeps the source ref", () => {
		assert.equal(bankQuestionFromRow(row({ answer: null })), null);
		assert.equal(bankQuestionFromRow(row({ answer: "" })), null);
		assert.equal(q().sourceRef, "pyq:2024:1");
		assert.equal(q({ source_ref: undefined }).sourceRef, "q1");
	});

	it("reads the Allen export's flag when has_worked_solution is absent", () => {
		assert.equal(q({ has_worked_solution: undefined, solution: "Answer: C" }).hasWorkedSolution, false);
		assert.equal(q({ has_worked_solution: undefined, solution: "Use F = ma." }).hasWorkedSolution, true);
	});
});

describe("question bank search", () => {
	it("filters by subject, chapter and topic parts, exam, format, difficulty and text", () => {
		assert.deepEqual(matchQuestions(BANK, { subject: "Physics" }).map((x) => x.id), ["q1", "q2", "q3"]);
		assert.deepEqual(matchQuestions(BANK, { chapter: "current" }).map((x) => x.id), ["q1", "q2"]);
		assert.deepEqual(matchQuestions(BANK, { topic: "kirchhoff", difficulty: "hard" }).map((x) => x.id), ["q2"]);
		assert.deepEqual(matchQuestions(BANK, { exam: "none" }).map((x) => x.id), ["q3"]);
		assert.deepEqual(matchQuestions(BANK, { exam: "jee_advanced" }).map((x) => x.id), ["q4"]);
		assert.deepEqual(matchQuestions(BANK, { format: "integer" }).map((x) => x.id), ["q3"]);
		assert.deepEqual(matchQuestions(BANK, { text: "WIRE stretched" }).map((x) => x.id), ["q2"]);
		assert.deepEqual(matchQuestions(BANK, { subject: "physics", exclude: ["q1", "q3"] }).map((x) => x.id), ["q2"]);
	});

	it("samples up to the limit and reports the total", () => {
		const res = searchQuestions(BANK, { subject: "physics", limit: 2 }, () => 0);
		assert.equal(res.total, 3);
		assert.deepEqual(res.questions.map((x) => x.id), ["q1", "q2"]);
		assert.equal(searchQuestions(BANK, { limit: 50 }).questions.length, 4);
		assert.equal(searchQuestions(BANK, {}).questions.length, 3);
	});

	it("outlines subjects, then chapters with topics", () => {
		assert.match(bankOutline(BANK), /physics \(3\)/);
		const physics = bankOutline(BANK, "physics");
		assert.match(physics, /Current Electricity \(2\): Kirchhoff's Laws \(2\)/);
		assert.match(physics, /Capacitor \(1\)/);
		assert.match(bankOutline(BANK, "biology"), /No questions/);
		assert.match(bankOutline([]), /empty/);
	});
});

describe("question bank output", () => {
	it("shows source, options, answer and solution", () => {
		const text = formatBankQuestion(q());
		assert.match(text, /^\[q1\] JEE Main 2024 · physics › Current Electricity › Kirchhoff's Laws · mcq_single · medium/);
		assert.match(text, /\(2\) 2 A/);
		assert.match(text, /Answer: 2\n/);
		assert.match(text, /Solution:\nApply KVL/);
	});

	it("says when there is only an answer key, and prints matrix answers", () => {
		assert.match(formatBankQuestion(BANK[2]!), /practice sheet[\s\S]*Answer: 4\nSolution: none in the bank/);
		const matrix = formatBankQuestion(
			q({
				format: "matrix",
				options: { type: "matrix", left: [{ id: "A", text: "x" }], right: [{ id: "P", text: "y" }, { id: "Q", text: "z" }] },
				answer: { A: ["P", "Q"] },
			}),
		);
		assert.match(matrix, /Column I:\n {2}\(A\) x\nColumn II:/);
		assert.match(matrix, /Answer: A → P, Q/);
	});
});

describe("question bank tools", () => {
	const tools = questionBankTools({ questions: () => BANK, random: () => 0 });

	it("find_questions returns matches or a hint", async () => {
		const hit = await tools.find_questions!.execute("t1", { chapter: "current", limit: 1 });
		assert.match(JSON.stringify(hit.content), /2 question\(s\) match; showing 1/);
		const miss = await tools.find_questions!.execute("t2", { topic: "optics" });
		assert.match(JSON.stringify(miss.content), /question_bank_topics/);
	});

	it("question_bank_topics lists chapters", async () => {
		const res = await tools.question_bank_topics!.execute("t1", { subject: "chemistry" });
		assert.match(JSON.stringify(res.content), /P Block \(1\): Group 15 \(1\)/);
	});

	it("registers on the practice registry only with a bank", () => {
		const chatStore = { getChat: () => null };
		assert.equal("find_questions" in practiceTools({ chatId: "c", chatStore }), false);
		const withBank = practiceTools({ chatId: "c", chatStore, questionBank: () => BANK });
		assert.ok(withBank.find_questions && withBank.question_bank_topics);
	});
});

describe("question bank store", () => {
	it("loads every bank folder and keeps the first copy of a source question", () => {
		const dir = path.join(PATHS.data, "question-bank");
		assert.equal(questionBankAvailable(), false);
		assert.deepEqual(loadQuestionBank(), []);
		fs.mkdirSync(path.join(dir, "a"), { recursive: true });
		fs.mkdirSync(path.join(dir, "b"), { recursive: true });
		fs.writeFileSync(path.join(dir, "a", "questions.jsonl"), [JSON.stringify(row()), "not json", JSON.stringify(row({ id: "q9", answer: null }))].join("\n"));
		fs.writeFileSync(path.join(dir, "b", "questions.jsonl"), [JSON.stringify(row({ id: "dup" })), JSON.stringify(row({ id: "q5", source_ref: "allen:7" }))].join("\n"));
		assert.equal(questionBankAvailable(), true);
		assert.deepEqual(loadQuestionBank().map((x) => x.id), ["q1", "q5"]);
		fs.rmSync(dir, { recursive: true, force: true });
	});
});
