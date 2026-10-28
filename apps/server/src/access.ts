import { timingSafeEqual } from "node:crypto";

/**
 * Hosted access gate. When AXIOM_ACCESS_TOKEN is set (the hosted deployment),
 * every /api request must carry it, as `Authorization: Bearer <token>` or,
 * for clients that can't set headers (browser EventSource / WebSocket), as an
 * `access_token` query parameter. Unset (local dev, desktop) the API is open,
 * exactly as before.
 */
export function hostedAccessAllowed(
	headers: Headers,
	url: string,
	env: Record<string, string | undefined> = process.env,
): boolean {
	const expected = env.AXIOM_ACCESS_TOKEN;
	if (!expected) return true;
	const auth = headers.get("authorization");
	const fromHeader = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
	const supplied = fromHeader ?? new URL(url).searchParams.get("access_token");
	if (!supplied) return false;
	const a = Buffer.from(supplied);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

/** Origins allowed to call the API from a browser (comma-separated env). */
export function corsOrigins(env: Record<string, string | undefined> = process.env): string[] {
	return (env.AXIOM_CORS_ORIGINS ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}
