// Next.js transport for /api/chats/[id]. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/chats-id.ts";

export const GET = route.GET;
export const PUT = route.PUT;
export const DELETE = route.DELETE;
