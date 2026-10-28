import { chainsForSelection, formatChainLine } from "../../core/index.ts";
import { ankiNote, memoryNote, newGraphContextMessage, type GraphContextPick } from "../../core/index.ts";
import { cachedAnkiCardStats, compactionInFlight, createChat, refreshAnkiReviews, reviewStateMap, isTurnRunning, listChats, readSettingsRecord, stores, titleFromPrompt } from "../../server/index.ts";
import type { ChatListItem } from "../../core/index.ts";

/** The session picker's list: record-derived summaries (phase, pending
 *  question) + live liveness — a running turn marks the session busy
 *  (contracts.ts ChatListItem; the store can't see liveness, the route is
 *  the merge point). Owner, minimal-color round: background jobs NO LONGER
 *  count — the sidebar's Background agents section is their channel now
 *  (a running spinner per row would double-signal them), so busy means
 *  exactly "a teach turn is in flight". */
export async function GET() {
	const chats: ChatListItem[] = listChats().map((c) => ({
		...c,
		busy: isTurnRunning(c.id),
		compacting: compactionInFlight(c.id),
	}));
	return Response.json({ chats });
}

export async function POST(req: Request) {
	const body = (await req.json().catch(() => ({}))) as { title?: unknown; kind?: unknown; graphContext?: unknown; folderId?: unknown };
	const title = typeof body.title === "string" ? body.title : "";
	// Practice sessions (owner, 2026-10-04): kind "practice" marks the
	// record — the practice agent + its tools from turn 1, no extraction.
	const kind = body.kind === "practice" ? ("practice" as const) : undefined;
	const chat = createChat(titleFromPrompt(title || "Untitled session"), kind);
	// Started from a folder in the sidebar: save it there from birth. An
	// unknown folder id (deleted meanwhile) just leaves it outside folders.
	const folderId = body.folderId;
	if (typeof folderId === "string" && stores.chatStore.listFolders().some((f) => f.id === folderId)) {
		stores.chatStore.setChatFolder(chat.id, folderId);
	}
	// PER-SESSION MODELS (owner, 2026-09-28): a session owns its model +
	// thinking level from birth — stamped verbatim from the STRONG slot,
	// the new-session default. From here the strong slot never reaches
	// this session again: in-session picks write the session's own record
	// (PUT /api/chats/:id/settings). No strong slot configured (fresh BYOK
	// boot) → no stamp; the turn gate's 503 models_not_configured envelope
	// refuses honestly until the setup flow fills the slot.
	const strong = readSettingsRecord()?.models?.strong;
	if (strong?.model) {
		stores.chatStore.saveSettings(chat.id, {
			model: { provider: strong.model.provider, id: strong.model.id },
			thinkingLevel: strong.thinkingLevel,
		});
	}
	// The session's map context (owner, 2026-10-04): the picked
	// propositions ride the CREATION — message[0] is a graph-context
	// marker (a separate custom message BEFORE the learner's first user
	// message), carrying the picks plus the reasoning chains among them.
	// The picks carry their own name/statement (what the learner saw at
	// pick time); the chains derive from the CURRENT graph snapshot.
	const rawPicks = (body.graphContext as { propositions?: unknown } | undefined)?.propositions;
	const picks: GraphContextPick[] = Array.isArray(rawPicks)
		? rawPicks
				.filter(
						(p): p is GraphContextPick =>
							typeof p === "object" &&
							p !== null &&
							typeof (p as GraphContextPick).id === "string" &&
							typeof (p as GraphContextPick).name === "string" &&
							typeof (p as GraphContextPick).statement === "string",
					)
					.slice(0, 64)
			: [];
	if (picks.length > 0) {
		const byId = new Map(stores.graphStore.readNodes().map((n) => [n.id, n]));
		const pickedNodes = picks.map((p) => byId.get(p.id)).filter((n) => n !== undefined);
		const chainLines = chainsForSelection(pickedNodes, stores.graphStore.readChains()).map((c) =>
			formatChainLine(c, Object.fromEntries(byId)),
		);
		// SPACED REVIEW: the picks carry each node's memory state (last
		// practiced, estimated recall, due) so the agent can weigh decay when
		// it picks targets and difficulty. The learner's Anki reviews are read
		// first (when the sync is on) and count toward that state; their card
		// stats ride along. Practice notes every pick; a lesson only the picks
		// with any review history.
		await refreshAnkiReviews();
		const now = Date.now();
		const states = reviewStateMap(now);
		const cards = cachedAnkiCardStats();
		const notes: Record<string, string> = {};
		for (const p of picks) {
			const state = states.get(p.id);
			const anki = ankiNote(cards[p.id], now);
			if (kind !== "practice" && !state && !anki) continue;
			notes[p.id] = [memoryNote(state, now), anki].filter(Boolean).join("; ");
		}
		stores.chatStore.saveMessages(chat.id, [newGraphContextMessage(picks, chainLines, notes)]);
	}
	return Response.json({ id: chat.id, title: chat.title });
}
