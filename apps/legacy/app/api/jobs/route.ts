// Next.js transport for /api/jobs. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/jobs.ts";

export const GET = route.GET;
export const dynamic = "force-dynamic";
