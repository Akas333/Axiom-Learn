/**
 * GET /api/data — what an export would carry right now (file, chat and
 * material counts, total size). See server/data-transfer.ts.
 */
import { dataSummary } from "../../server/index.ts";

export async function GET() {
	return Response.json(dataSummary(), { headers: { "Cache-Control": "no-store" } });
}
