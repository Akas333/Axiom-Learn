/**
 * POST /api/data/import — replace the data folder with a .tysa file's
 * contents. Multipart form: "file" (the bundle) and "passphrase". The
 * previous data is kept under <data>/.backups/ (server/data-transfer.ts).
 */
import { BundleError, DataBusyError, importData } from "../../server/index.ts";

export async function POST(request: Request) {
	const form = await request.formData().catch(() => null);
	const file = form?.get("file");
	const passphrase = form?.get("passphrase");
	if (!(file instanceof File) || typeof passphrase !== "string") {
		return Response.json({ error: "Choose a .tysa file and enter its passphrase." }, { status: 400 });
	}
	try {
		const result = importData(Buffer.from(await file.arrayBuffer()), passphrase);
		return Response.json(result);
	} catch (err) {
		if (err instanceof BundleError) return Response.json({ error: err.message, code: err.code }, { status: 400 });
		if (err instanceof DataBusyError) return Response.json({ error: err.message, code: "busy" }, { status: 409 });
		throw err;
	}
}
