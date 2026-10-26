// Next.js transport for /api/graph/positions. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/graph-positions.ts";

export const PUT = route.PUT;
export const dynamic = "force-dynamic";
