// Next.js transport for /api/graph/render-settings. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/graph-render-settings.ts";

export const GET = route.GET;
export const PUT = route.PUT;
export const dynamic = "force-dynamic";
