/**
 * The question-bank store (2026-10-30): reads every
 * data/question-bank/<bank>/questions.jsonl, in folder-name order, and
 * keeps the first copy of each source question (banks overlap — the
 * Hudjee export already holds the Allen STAR sheets). Read-only; cached
 * until a file's size or mtime changes. A missing folder is an empty bank.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { PATHS } from "../../config.ts";
import { bankQuestionFromRow, type BankQuestion } from "../core/question-bank.ts";

function bankDir(): string {
	return path.join(PATHS.data, "question-bank");
}

function bankFiles(): string[] {
	const dir = bankDir();
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => path.join(dir, d.name, "questions.jsonl"))
		.filter((f) => fs.existsSync(f))
		.sort();
}

let cache: { key: string; questions: BankQuestion[] } | null = null;

export function loadQuestionBank(): BankQuestion[] {
	const files = bankFiles();
	const key = files
		.map((f) => {
			const st = fs.statSync(f);
			return `${f}:${st.size}:${st.mtimeMs}`;
		})
		.join("|");
	if (cache && cache.key === key) return cache.questions;
	const seen = new Set<string>();
	const questions: BankQuestion[] = [];
	for (const file of files) {
		for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
			if (!line.trim()) continue;
			let row: Record<string, unknown>;
			try {
				row = JSON.parse(line) as Record<string, unknown>;
			} catch {
				continue;
			}
			const q = bankQuestionFromRow(row);
			if (!q || seen.has(q.sourceRef)) continue;
			seen.add(q.sourceRef);
			questions.push(q);
		}
	}
	cache = { key, questions };
	return questions;
}

/** True when at least one bank file exists (the tools register only then). */
export function questionBankAvailable(): boolean {
	return bankFiles().length > 0;
}
