/**
 * POST /api/data/export — the encrypted .tysa file of the data folder.
 * Body: JSON { passphrase }. The passphrase travels in the body, never the
 * URL, and is not stored.
 */
import { BUNDLE_EXTENSION, BundleError, exportData } from "../../server/index.ts";

export async function POST(request: Request) {
	const body = (await request.json().catch(() => null)) as { passphrase?: unknown } | null;
	const passphrase = typeof body?.passphrase === "string" ? body.passphrase : "";
	try {
		const { bundle, summary } = exportData(passphrase);
		const day = new Date().toISOString().slice(0, 10);
		return new Response(new Uint8Array(bundle), {
			headers: {
				"Content-Type": "application/octet-stream",
				"Content-Disposition": `attachment; filename="tysa-data-${day}${BUNDLE_EXTENSION}"`,
				"Cache-Control": "no-store",
				"X-TYSA-Files": String(summary.files),
			},
		});
	} catch (err) {
		if (err instanceof BundleError) return Response.json({ error: err.message, code: err.code }, { status: 400 });
		throw err;
	}
}
