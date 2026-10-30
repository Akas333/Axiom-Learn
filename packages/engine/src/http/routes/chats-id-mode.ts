import { getChat, isTurnRunning, stores } from "../../server/index.ts";
import { hasProbeDone } from "../../core/index.ts";

/**
 * The probe's Switch to practice (2026-10-29): POST { kind: "practice" }
 * flips a concluded probe's chat to a practice session IN PLACE — the
 * probe history stays as the practitioner's calibration. The card then
 * sends the learner's own message, and that turn builds the practice
 * agent (chat-handler keys on record.kind). Teach me anyway needs no
 * route: its message builds the teacher off the probe_done seam.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const record = getChat(id);
	if (!record) return Response.json({ error: "Not found" }, { status: 404 });

	const body = (await req.json().catch(() => null)) as { kind?: unknown } | null;
	if (body?.kind !== "practice") {
		return Response.json({ error: 'kind must be "practice"' }, { status: 400 });
	}
	if (record.kind === "practice") return Response.json({ kind: "practice" });
	if (!hasProbeDone(record.messages)) {
		return Response.json({ error: "The probe has not concluded yet" }, { status: 409 });
	}
	if (isTurnRunning(id)) {
		return Response.json({ error: "A turn is running in this session — try again when it finishes" }, { status: 409 });
	}
	stores.chatStore.setChatKind(id, "practice");
	return Response.json({ kind: "practice" });
}
