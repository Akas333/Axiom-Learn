// Next.js transport for /api/settings/[section]. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/settings-section.ts";

export const PUT = route.PUT;
export const dynamic = "force-dynamic";
