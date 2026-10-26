// Next.js transport for /api/chats. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/chats.ts";

export const GET = route.GET;
export const POST = route.POST;
