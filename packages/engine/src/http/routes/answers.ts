/**
 * GET /api/answers — the graded-answer log and the per-node ability
 * estimates folded from it (core/answer-log.ts). `?chatId=` narrows both
 * to one chat. Thin transport over src/server's answerLog/answerAbility.
 */
import { answerAbility, answerLog } from "../../server/index.ts";

export async function GET(req: Request) {
	const chatId = new URL(req.url).searchParams.get("chatId") || undefined;
	return Response.json({ events: answerLog(chatId), ability: answerAbility(chatId) });
}
