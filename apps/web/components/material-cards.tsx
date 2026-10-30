import { useCallback, useEffect, useRef, useState } from "react";
import { FileTextIcon, ImageIcon, LoaderCircleIcon, PaperclipIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { isMaterialMime, MATERIAL_MAX_BYTES, MATERIAL_MIME_TYPES, type MaterialRecord } from "@/src/core";
import { ToolContentResponse } from "@/components/ai-elements/message";
import { useServerEvent } from "@/components/server-events";
import { Textarea } from "@/components/ui/textarea";

/**
 * Materials (2026-10-29): images and PDFs the learner attaches to a chat or
 * a course folder. The card follows a material's transcription live and
 * lets the learner read and correct the text the tutor will teach from;
 * the paperclip uploads into a chat or a folder (or, before a chat exists,
 * hands the picked files back to be attached once it does).
 */

/** The material marker's UI payload (native-messages newMaterialMessage). */
export interface MaterialMarkerData {
	materialId: string;
	name: string;
	mime: string;
}

/** One material, live: refetched on its materials-changed events. */
export function useMaterial(id: string): [MaterialRecord | null, (next: MaterialRecord) => void] {
	const [material, setMaterial] = useState<MaterialRecord | null>(null);
	const refresh = useCallback(async () => {
		try {
			const res = await fetch(`/api/materials/${encodeURIComponent(id)}`, { cache: "no-store" });
			if (res.ok) setMaterial(((await res.json()) as { material: MaterialRecord }).material);
		} catch (err) {
			console.error("material fetch failed:", err);
		}
	}, [id]);
	useEffect(() => {
		void refresh();
	}, [refresh]);
	useServerEvent("materials-changed", (e) => {
		if (e.id === id) void refresh();
	});
	return [material, setMaterial];
}

function MaterialStatus({ material }: { material: MaterialRecord | null }) {
	if (!material || material.status === "extracting") {
		return (
			<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
				<LoaderCircleIcon className="size-3.5 animate-spin" />
				Transcribing{material?.pageCount ? ` · page ${material.pagesDone ?? 0} of ${material.pageCount}` : "…"}
			</span>
		);
	}
	if (material.status === "failed") return <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">Failed</span>;
	return material.editedAt ? (
		<span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs text-sky-400">Corrected</span>
	) : (
		<span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-400">Ready</span>
	);
}

const QUIET_PILL =
	"inline-flex h-8 items-center gap-1.5 rounded-full bg-(--pill) px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-(--pill-hover) disabled:opacity-50";

/** The transcript card of an attached material. */
export function MaterialCard({ data }: { data: MaterialMarkerData }) {
	const [material, setMaterial] = useMaterial(data.materialId);
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const Icon = data.mime === "application/pdf" ? FileTextIcon : ImageIcon;

	const save = async () => {
		if (draft === null) return;
		setSaving(true);
		setSaveError(null);
		try {
			const res = await fetch(`/api/materials/${encodeURIComponent(data.materialId)}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ markdown: draft }),
			});
			if (!res.ok) throw new Error(`save failed: ${res.status}`);
			setMaterial(((await res.json()) as { material: MaterialRecord }).material);
			setDraft(null);
		} catch (err) {
			console.error(err);
			setSaveError("Couldn't save the correction — try again.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div data-testid="material-card" className="my-2 rounded-xl border bg-card/60 px-4 py-3">
			<div className="flex items-center gap-2">
				<Icon className="size-3.5 shrink-0 text-primary" />
				<span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{data.name}</span>
				<MaterialStatus material={material} />
				{material?.status === "ready" && draft === null && (
					<button
						type="button"
						data-testid="material-toggle"
						onClick={() => setOpen(!open)}
						className="rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						{open ? "Hide text" : "Show text"}
					</button>
				)}
			</div>
			{material?.status === "failed" && <p className="mt-1 text-xs text-muted-foreground">{material.error ?? "The transcription failed."}</p>}
			{open && material?.status === "ready" && draft === null && (
				<div className="mt-3">
					<div className="lh-prose max-h-[28rem] overflow-y-auto text-[15px]">
						<ToolContentResponse>{material.markdown}</ToolContentResponse>
					</div>
					<div className="mt-2 flex justify-end">
						<button type="button" data-testid="material-edit" className={QUIET_PILL} onClick={() => setDraft(material.markdown)}>
							<PencilIcon className="size-3.5" />
							Correct the text
						</button>
					</div>
				</div>
			)}
			{draft !== null && (
				<div className="mt-3">
					<p className="mb-1.5 text-xs text-muted-foreground">Fix any misread symbol or number — the tutor reads your version from the next message on.</p>
					<Textarea aria-label="Transcription" value={draft} onChange={(e) => setDraft(e.target.value)} rows={16} className="font-mono text-xs" />
					{saveError && <p className="mt-1 text-xs text-red-400">{saveError}</p>}
					<div className="mt-2 flex justify-end gap-2">
						<button type="button" className={QUIET_PILL} onClick={() => setDraft(null)}>Cancel</button>
						<button
							type="button"
							data-testid="material-save"
							disabled={saving}
							onClick={() => void save()}
							className="inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
						>
							{saving ? "Saving…" : "Save"}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

/** Upload one file as material for a chat or a folder. */
export async function uploadMaterial(
	file: File,
	target: { chatId?: string; folderId?: string },
	fetchLike: typeof fetch = fetch,
): Promise<MaterialRecord> {
	const form = new FormData();
	form.set("file", file);
	if (target.chatId) form.set("chatId", target.chatId);
	if (target.folderId) form.set("folderId", target.folderId);
	const res = await fetchLike("/api/materials", { method: "POST", body: form });
	const body = (await res.json().catch(() => ({}))) as { material?: MaterialRecord; error?: string };
	if (!res.ok || !body.material) throw new Error(body.error ?? `upload failed: ${res.status}`);
	return body.material;
}

/** The paperclip: picks PDFs or images and uploads them straight away —
 *  or, before a chat exists (home, the new-session draft), hands the
 *  picked files back to be uploaded once the chat is created. */
export function AttachMaterialControl({
	chatId,
	folderId,
	disabled,
	onAttached,
	onPicked,
	pasteTarget,
}: {
	chatId?: string;
	folderId?: string;
	disabled?: boolean;
	onAttached?: (material: MaterialRecord) => void;
	/** No chat yet: the picked files, uploaded by the caller later. */
	onPicked?: (files: File[]) => void;
	/** The composer's text field: files pasted into it (⌘/Ctrl+V of a
	 *  screenshot, a copied image or a file copied in Finder) attach
	 *  exactly like a pick. Text-only pastes stay native. */
	pasteTarget?: React.RefObject<HTMLElement | null>;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const pick = async (list: File[]) => {
		const tooBig = list.find((f) => f.size > MATERIAL_MAX_BYTES);
		if (tooBig) {
			setError(`${tooBig.name} is larger than 25 MB.`);
			return;
		}
		setError(null);
		if (!chatId && !folderId) {
			onPicked?.(list);
			return;
		}
		setBusy(true);
		try {
			for (const file of list) onAttached?.(await uploadMaterial(file, { chatId, folderId }));
		} catch (err) {
			setError(err instanceof Error ? err.message : "Upload failed.");
		} finally {
			setBusy(false);
		}
	};
	// Re-subscribed every render so the listener always calls the current
	// pick (chatId, callbacks).
	useEffect(() => {
		const field = pasteTarget?.current;
		if (!field) return;
		const onPaste = (e: ClipboardEvent) => {
			const files = Array.from(e.clipboardData?.files ?? []);
			if (files.length === 0) return;
			// A file copied in Finder also carries its name as text — the
			// file wins, the name never lands in the composer.
			e.preventDefault();
			if (disabled || busy) {
				setError("Attach once the current reply has finished.");
				return;
			}
			const accepted = files.filter((f) => isMaterialMime(f.type));
			if (accepted.length === 0) {
				setError("Only PDFs and images (PNG, JPEG, WebP) can be attached.");
				return;
			}
			void pick(accepted);
		};
		field.addEventListener("paste", onPaste);
		return () => field.removeEventListener("paste", onPaste);
	});
	return (
		<>
			<button
				type="button"
				data-testid="attach-material"
				title={error ?? "Attach material — textbook pages, notes or problem sheets (PDF or images)"}
				aria-label="Attach material"
				disabled={disabled || busy}
				onClick={() => inputRef.current?.click()}
				className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-accent disabled:opacity-50 ${error ? "text-red-400" : "text-muted-foreground hover:text-foreground"}`}
			>
				{busy ? <LoaderCircleIcon className="size-4 animate-spin" /> : <PaperclipIcon className="size-4" />}
			</button>
			<input
				ref={inputRef}
				type="file"
				multiple
				hidden
				accept={MATERIAL_MIME_TYPES.join(",")}
				onChange={(e) => {
					const list = Array.from(e.target.files ?? []);
					e.target.value = "";
					if (list.length > 0) void pick(list);
				}}
			/>
		</>
	);
}

/** A folder's shared material: the list plus the paperclip. */
export function FolderMaterials({ folderId, isCourse }: { folderId: string; isCourse: boolean }) {
	const [materials, setMaterials] = useState<MaterialRecord[] | null>(null);
	const refresh = useCallback(async () => {
		try {
			const res = await fetch(`/api/folders/${encodeURIComponent(folderId)}/materials`, { cache: "no-store" });
			if (res.ok) setMaterials(((await res.json()) as { materials: MaterialRecord[] }).materials);
		} catch (err) {
			console.error("folder materials fetch failed:", err);
		}
	}, [folderId]);
	useEffect(() => {
		void refresh();
	}, [refresh]);
	useServerEvent("materials-changed", (e) => {
		if (e.folderId === folderId) void refresh();
	});
	const remove = async (id: string) => {
		setMaterials((prev) => (prev ? prev.filter((m) => m.id !== id) : prev));
		await fetch(`/api/materials/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
		void refresh();
	};
	return (
		<div data-testid="folder-materials">
			<div className="flex items-center justify-between gap-2">
				<div className="text-sm font-semibold text-foreground">{isCourse ? "Course material" : "Folder material"}</div>
				<AttachMaterialControl folderId={folderId} onAttached={() => void refresh()} />
			</div>
			<p className="mb-2 text-xs text-muted-foreground">Every chat in this folder can read it.</p>
			{materials === null ? (
				<LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" />
			) : materials.length === 0 ? (
				<p className="text-xs text-muted-foreground">Nothing attached yet.</p>
			) : (
				<ul className="divide-y divide-border/60">
					{materials.map((m) => (
						<li key={m.id} className="flex items-center gap-2 py-2 text-sm">
							{m.mime === "application/pdf" ? <FileTextIcon className="size-4 shrink-0" /> : <ImageIcon className="size-4 shrink-0" />}
							<span className="min-w-0 flex-1">
								<span className="block truncate text-foreground">{m.name}</span>
								<span className="text-xs text-muted-foreground">
									{m.status === "extracting" ? "Transcribing…" : m.status === "failed" ? "Transcription failed" : `${m.pageCount ?? 1} page${(m.pageCount ?? 1) === 1 ? "" : "s"}`}
								</span>
							</span>
							<button
								type="button"
								aria-label={`Remove ${m.name}`}
								onClick={() => void remove(m.id)}
								className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							>
								<Trash2Icon className="size-4" />
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
