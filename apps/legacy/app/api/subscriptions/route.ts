// Next.js transport for /api/subscriptions. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/subscriptions.ts";

export const GET = route.GET;
export const POST = route.POST;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
