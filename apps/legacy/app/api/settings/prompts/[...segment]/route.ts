// Next.js transport for /api/settings/prompts/[...segment]. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/settings-prompts-segment.ts";

export const PUT = route.PUT;
export const DELETE = route.DELETE;
export const dynamic = "force-dynamic";
