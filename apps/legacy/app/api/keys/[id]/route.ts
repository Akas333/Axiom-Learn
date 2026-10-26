// Next.js transport for /api/keys/[id]. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/keys-id.ts";

export const PUT = route.PUT;
export const DELETE = route.DELETE;
export const dynamic = "force-dynamic";
