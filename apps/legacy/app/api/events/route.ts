// Next.js transport for /api/events. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/events.ts";

export const GET = route.GET;
export const dynamic = "force-dynamic";
