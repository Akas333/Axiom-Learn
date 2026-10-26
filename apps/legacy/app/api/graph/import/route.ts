// Next.js transport for /api/graph/import. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/graph-import.ts";

export const POST = route.POST;
export const dynamic = "force-dynamic";
