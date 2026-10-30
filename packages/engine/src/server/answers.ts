/**
 * The graded-answer log over every chat (2026-10-30): the pure fold in
 * core/answer-log.ts run across the chat store. Read-time, so the whole
 * history counts and nothing is stored twice.
 */
import { abilityOf, answerEventsOf, type AnswerEvent, type NodeAbility } from "../core/answer-log.ts";
import { stores } from "./stores.ts";

/** Every graded answer, oldest first; one chat's when chatId is given. */
export function answerLog(chatId?: string): AnswerEvent[] {
	const ids = chatId ? [chatId] : stores.chatStore.listChats().map((c) => c.id);
	const events: AnswerEvent[] = [];
	for (const id of ids) {
		const record = stores.chatStore.getChat(id);
		if (record) events.push(...answerEventsOf(record));
	}
	return events.sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
}

/** The per-node ability estimates folded from that log. */
export function answerAbility(chatId?: string): NodeAbility[] {
	return abilityOf(answerLog(chatId));
}
