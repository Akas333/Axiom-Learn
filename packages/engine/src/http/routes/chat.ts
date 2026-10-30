import { handleChatRequest } from "../../server/index.ts";

export async function POST(req: Request) {
	return handleChatRequest(req);
}
