// Next.js transport for /api/graph/coverage/extract. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/graph-coverage-extract.ts";

export const POST = route.POST;
export const dynamic = "force-dynamic";
