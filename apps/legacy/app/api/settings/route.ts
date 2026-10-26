// Next.js transport for /api/settings. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/settings.ts";

export const GET = route.GET;
export const dynamic = "force-dynamic";
