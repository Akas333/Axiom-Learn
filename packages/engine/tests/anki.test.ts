/**
 * ANKI: graph → deck (push plan, field HTML), Anki reviews → review events,
 * and the full loop against a fake AnkiConnect server.
 */

import assert from "node:assert/strict";
import * as http from "node:http";
import { after, before, describe, it } from "node:test";

import {
	ankiCardStat,
	ankiFieldsFor,
	ankiNote,
	ankiReviewEvents,
	fieldsHash,
	isAllowedAnkiUrl,
	parseAnkiBody,
	planAnkiPush,
	sanitizeAnki,
	toAnkiHtml,
} from "../src/core/anki.ts";
import { memoryNote, reviewStates } from "../src/core/review.ts";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1, 12);

describe("anki settings", () => {
	it("only allows AnkiConnect on this computer", () => {
		assert.equal(isAllowedAnkiUrl("http://127.0.0.1:8765"), true);
		assert.equal(isAllowedAnkiUrl("http://localhost:8765"), true);
		assert.equal(isAllowedAnkiUrl("http://example.com:8765"), false);
		assert.equal(isAllowedAnkiUrl("http://169.254.169.254/"), false);
		assert.equal(isAllowedAnkiUrl("file:///etc/passwd"), false);
	});

	it("rejects bad writes and drops bad stored values", () => {
		assert.equal(parseAnkiBody({ enabled: "yes" }).ok, false);
		assert.equal(parseAnkiBody({ url: "http://10.0.0.2:8765" }).ok, false);
		assert.equal(parseAnkiBody({ deck: 'a"b' }).ok, false);
		assert.deepEqual(parseAnkiBody({ enabled: true, deck: " Physics::Axiom " }), {
			ok: true,
			settings: { enabled: true, deck: "Physics::Axiom" },
		});
		assert.deepEqual(sanitizeAnki({ enabled: true, url: "http://evil.test" }), { enabled: true });
	});
});

describe("anki push", () => {
	it("escapes HTML and rewrites TeX for MathJax", () => {
		assert.equal(toAnkiHtml("a < b & $x^2$ costs $5"), "a &lt; b &amp; \\(x^2\\) costs $5");
		assert.equal(toAnkiHtml("$$E = mc^2$$"), "\\[E = mc^2\\]");
		assert.equal(toAnkiHtml("line\nbreak"), "line<br>break");
	});

	it("adds new nodes, updates changed text, keeps learner deletions and edits", () => {
		const nodes = [
			{ id: "n_new", name: "New", statement: "fresh" },
			{ id: "n_same", name: "Same", statement: "unchanged" },
			{ id: "n_changed", name: "Changed", statement: "now different" },
			{ id: "n_deleted", name: "Deleted", statement: "learner removed it" },
		];
		const pushed = {
			n_same: fieldsHash(ankiFieldsFor(nodes[1]!)),
			n_changed: fieldsHash(ankiFieldsFor({ id: "n_changed", name: "Changed", statement: "before" })),
			n_deleted: "anything",
		};
		const plan = planAnkiPush(
			nodes,
			[
				{ noteId: 2, nodeId: "n_same" },
				{ noteId: 3, nodeId: "n_changed" },
			],
			pushed,
		);
		assert.deepEqual(plan.add.map((a) => a.nodeId), ["n_new"]);
		assert.deepEqual(plan.update.map((u) => [u.nodeId, u.noteId]), [["n_changed", 3]]);
	});
});

describe("anki pull", () => {
	it("keeps the first rated review per day and skips reschedules", () => {
		const events = ankiReviewEvents("n1", [
			{ id: T0, ease: 1, type: 0 },
			{ id: T0 + 60_000, ease: 3, type: 0 }, // same-day learning step
			{ id: T0 + 2 * DAY, ease: 0, type: 4 }, // manual reschedule
			{ id: T0 + 3 * DAY, ease: 3, type: 1 },
		]);
		assert.deepEqual(
			events.map((e) => [e.at, e.grade, e.mode]),
			[
				[T0, 1, "flashcard"],
				[T0 + 3 * DAY, 3, "flashcard"],
			],
		);
	});

	it("flashcard reviews feed the memory state and its note", () => {
		const events = ankiReviewEvents("n1", [
			{ id: T0, ease: 3, type: 0 },
			{ id: T0 + 2 * DAY, ease: 1, type: 1 },
		]);
		const state = reviewStates(events, T0 + 3 * DAY).get("n1");
		assert.equal(state?.lastGrade, 1);
		assert.match(memoryNote(state, T0 + 3 * DAY), /last reviewed in Anki yesterday \(again\)/);
	});

	it("summarizes a card for the tutor", () => {
		const stat = ankiCardStat({ lapses: 3, interval: 4, queue: 2 }, [
			{ id: T0, ease: 1, type: 0 },
			{ id: T0 + DAY, ease: 3, type: 1 },
		]);
		assert.equal(
			ankiNote(stat, T0 + 3 * DAY),
			"Anki: 2 reviews, 3 lapses, interval 4d, last forgotten 3 days ago, forgotten often",
		);
		assert.equal(ankiNote(undefined, T0), undefined);
	});
});

// ─── the full loop against a fake AnkiConnect ────────────────────────────────

interface FakeNote {
	noteId: number;
	cardId: number;
	deck: string;
	fields: Record<string, string>;
}

function fakeAnki() {
	const models: string[] = ["Basic"];
	const decks = new Set<string>(["Default"]);
	const notes: FakeNote[] = [];
	const revlog: Record<string, { id: number; ease: number; type: number }[]> = {};
	let next = 1000;
	const handle = (action: string, p: Record<string, unknown>): unknown => {
		switch (action) {
			case "version":
				return 6;
			case "modelNames":
				return models;
			case "createModel":
				models.push(p.modelName as string);
				return {};
			case "createDeck":
				decks.add(p.deck as string);
				return 1;
			case "findNotes":
				return notes.map((n) => n.noteId);
			case "findCards":
				return notes.map((n) => n.cardId);
			case "notesInfo":
				return (p.notes as number[]).map((id) => {
					const n = notes.find((x) => x.noteId === id);
					return n && { noteId: n.noteId, fields: Object.fromEntries(Object.entries(n.fields).map(([k, v]) => [k, { value: v }])) };
				});
			case "addNotes":
				return (p.notes as { deckName: string; fields: Record<string, string> }[]).map((n) => {
					const noteId = next++;
					notes.push({ noteId, cardId: next++, deck: n.deckName, fields: n.fields });
					return noteId;
				});
			case "updateNoteFields": {
				const u = p.note as { id: number; fields: Record<string, string> };
				Object.assign(notes.find((n) => n.noteId === u.id)!.fields, u.fields);
				return null;
			}
			case "cardsInfo":
				return (p.cards as number[]).map((id) => {
					const n = notes.find((x) => x.cardId === id)!;
					return {
						cardId: id,
						note: n.noteId,
						fields: Object.fromEntries(Object.entries(n.fields).map(([k, v]) => [k, { value: v }])),
						interval: 3,
						lapses: (revlog[String(id)] ?? []).filter((r) => r.ease === 1).length,
						queue: 2,
					};
				});
			case "getReviewsOfCards":
				return Object.fromEntries((p.cards as string[]).map((id) => [id, revlog[id] ?? []]));
			default:
				throw new Error(`unsupported action ${action}`);
		}
	};
	const server = http.createServer((req, res) => {
		let body = "";
		req.on("data", (c) => (body += c));
		req.on("end", () => {
			const { action, params } = JSON.parse(body) as { action: string; params: Record<string, unknown> };
			try {
				res.end(JSON.stringify({ result: handle(action, params ?? {}), error: null }));
			} catch (err) {
				res.end(JSON.stringify({ result: null, error: String(err) }));
			}
		});
	});
	return { server, notes, decks, revlog };
}

describe("anki sync loop", () => {
	const fake = fakeAnki();
	let url = "";
	before(async () => {
		await new Promise<void>((r) => fake.server.listen(0, "127.0.0.1", r));
		url = `http://127.0.0.1:${(fake.server.address() as { port: number }).port}`;
	});
	after(() => fake.server.close());

	it("pushes the graph, reads reviews back, and annotates a new session", async () => {
		const { stores, syncAnki, writeSettingsRecord, reviewStateMap } = await import("../src/server/index.ts");
		const chatsRoute = await import("../src/http/routes/chats.ts");
		const node = (id: string, name: string, statement: string) => ({
			id,
			name,
			statement,
			aliases: [],
			createdAt: new Date(T0).toISOString(),
			provenance: [],
		});
		stores.graphStore.appendNode(node("n_ohm", "Ohm's law", "$V = IR$ for an ohmic conductor."));
		stores.graphStore.appendNode(node("n_kcl", "Kirchhoff's current law", "Current into a junction equals current out."));
		writeSettingsRecord({ version: 1, anki: { enabled: true, deck: "Physics", url } });

		const first = await syncAnki();
		assert.equal(first.ok, true, first.error);
		assert.equal(first.added, 2);
		assert.ok(fake.decks.has("Physics"));
		const ohm = fake.notes.find((n) => n.fields.NodeId === "n_ohm")!;
		assert.equal(ohm.fields.Statement, "\\(V = IR\\) for an ohmic conductor.");

		// A second sync adds nothing; the learner's edit in Anki survives.
		ohm.fields.Name = "Ohm (my wording)";
		const second = await syncAnki();
		assert.deepEqual([second.added, second.updated], [0, 0]);
		assert.equal(ohm.fields.Name, "Ohm (my wording)");

		// The learner forgets Ohm's law in Anki → it becomes shaky.
		const now = Date.now();
		fake.revlog[String(ohm.cardId)] = [
			{ id: now - 3 * DAY, ease: 3, type: 0 },
			{ id: now - DAY, ease: 1, type: 1 },
		];
		const res = await chatsRoute.POST(
			new Request("http://x/api/chats", {
				method: "POST",
				body: JSON.stringify({
					kind: "practice",
					graphContext: {
						propositions: [
							{ id: "n_ohm", name: "Ohm's law", statement: "V = IR" },
							{ id: "n_kcl", name: "KCL", statement: "in = out" },
						],
					},
				}),
			}),
		);
		const { id } = (await res.json()) as { id: string };
		const context = stores.chatStore.getChat(id)!.messages[0] as { content: string };
		assert.match(context.content, /\[n_ohm\].*last reviewed in Anki yesterday \(again\).*state shaky.*Anki: 2 reviews, 1 lapse/);
		assert.match(context.content, /\[n_kcl\].*memory: never practiced; Anki: card not reviewed yet/);
		assert.equal(reviewStateMap().get("n_ohm")?.lastGrade, 1);

		// Turning the sync off takes Anki out of the memory model.
		writeSettingsRecord({ version: 1, anki: { enabled: false, url } });
		assert.equal(reviewStateMap().get("n_ohm"), undefined);
	});
});
