import { courseEntries } from "../../server/index.ts";

/** A course folder's concepts in teaching order, each with its chat and
 *  status (2026-10-29) — the plan chat's map and the sidebar read it.
 *  404 when the folder is not a course. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const course = courseEntries(id);
	if (!course) return Response.json({ error: "Not a course folder" }, { status: 404 });
	return Response.json(course);
}
