import { stores } from "../../server/index.ts";

/** The materials attached to a folder (a course's shared material). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return Response.json({ materials: stores.materialStore.listMaterials({ folderIds: [id] }) });
}
