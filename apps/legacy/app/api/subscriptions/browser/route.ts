// Next.js transport for /api/subscriptions/browser. The handler lives in the engine (src/http).
import * as route from "@/src/http/routes/subscriptions-browser.ts";

export const GET = route.GET;
export const POST = route.POST;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
