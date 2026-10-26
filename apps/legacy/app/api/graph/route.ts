// Next.js transport for /api/graph. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/graph.ts";

export const GET = route.GET;
export const dynamic = "force-dynamic";
