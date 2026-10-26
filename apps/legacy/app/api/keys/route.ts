// Next.js transport for /api/keys. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/keys.ts";

export const GET = route.GET;
export const dynamic = "force-dynamic";
