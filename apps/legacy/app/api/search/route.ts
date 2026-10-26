// Next.js transport for /api/search. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/search.ts";

export const GET = route.GET;
export const dynamic = "force-dynamic";
