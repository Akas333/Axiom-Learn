// Next.js transport for /api/graph/costs. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/graph-costs.ts";

export const GET = route.GET;
export const dynamic = "force-dynamic";
