// Next.js transport for /api/activity. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/activity.ts";

export const GET = route.GET;
export const dynamic = "force-dynamic";
