/**
 * GET /api/review — spaced review: each practiced node's estimated recall
 * and due date, plus the due list (weakest first). Thin transport over
 * src/server's reviewView(); the scheduler is pure core (core/review.ts).
 */
import { reviewView } from "../../server/index.ts";

export async function GET() {
	return Response.json(reviewView());
}
