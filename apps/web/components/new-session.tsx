
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "@/lib/navigation";
import { Composer, COMPOSER_SHELL } from "@/components/composer";
import { joinDictation, useDictation } from "@/components/dictation";
import { FolderIcon, PlusIcon, XIcon } from "lucide-react";
import { LhMark } from "@/components/lh-mark";
import { SphereBackdrop } from "@/components/sphere-backdrop";
import { Hint } from "@/components/ui/hint";
import { StatsBar } from "@/components/stats-bar";
import { useFieldCycle } from "@/components/field-cycle";
import { SidebarToggle } from "@/components/sidebar";
import { SetupDialog } from "@/components/setup-dialog";
import { useStrongKeyless, useZeroKeys, ZeroKeysPill } from "@/components/setup-cta";
import { ChainTableOverlay } from "@/components/chain-table.tsx";
import { ComposerActions, SessionModeToggle, type SessionMode } from "@/components/composer-actions";
import { AttachMaterialControl, uploadMaterial } from "@/components/material-cards";
import type { ChatFolder, ChatSettings, GraphSnapshot } from "@/src/core";

/** The draft's pick set (owner round 10): the SAME shape the home pick
 *  bar lifts — resolved nodes as the learner SAW them at pick time. */
export type DraftPick = { id: string; name: string; statement: string };

/**
 * The sessionless draft view at /chat/new (owner, 2026-09-13): "+ New
 * session" opens THIS, never a created record — a session comes to exist
 * only when the learner sends the first message, and that message becomes
 * the session's title (the exact create-then-redirect contract the home
 * composer established). Visually identical to a fresh chat: same header
 * (title + probe chip), the same empty state, the same composer blob +
 * stats dock. The draft's model control binds the strong slot (the
 * new-session default); the created session is stamped from it
 * server-side (per-session models, owner 2026-09-28).
 */

const DOCK = "mx-auto w-full max-w-[46rem] px-4";

/**
 * The draft's whole behavior as one pure seam: create the session (title =
 * the first message), persist the lifted pre-chat settings, return the push
 * target — /chat/<id>?prompt=<msg> — whose initialPrompt path delivers the
 * message as turn 1. Injected fetch/router so tests pin the contract.
 * Returns null on empty text; rethrows on transport failure (the caller's
 * busy flag resets).
 */
export async function startDraftSession(
	text: string,
	fetchLike: typeof fetch,
	mode?: "practice" | "textbook",
	picks?: readonly DraftPick[],
	/** The sidebar folder the chat was started from (/chat/new?folder=). */
	folderId?: string,
	/** Material picked before the chat existed — attached right after it
	 *  is created, before its first turn (2026-10-29). */
	files?: readonly File[],
): Promise<string | null> {
	const t = text.trim();
	if (!t) return null;
	// THE PICKS RIDE THE CREATE (owner round 10): a practice draft seeded
	// from the pick bar creates its session WITH the graph context — the
	// same contract as the home screen's practice send (the marker with
	// [id] name: statement lines, target validation's truth set).
	const res = await fetchLike("/api/chats", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			...(mode === "practice"
				? { title: t, kind: "practice", ...(picks && picks.length > 0 ? { graphContext: { propositions: picks } } : {}) }
				: mode === "textbook"
					? { title: t, style: "textbook" }
					: { title: t }),
			...(folderId ? { folderId } : {}),
		}),
	});
	const { id } = (await res.json()) as { id: string };
	for (const file of files ?? []) {
		// A failed upload never blocks the session; the paperclip in the
		// chat can attach it again.
		await uploadMaterial(file, { chatId: id }, fetchLike).catch((err: unknown) => console.error("attach failed:", err));
	}
	// No settings PUT on create (per-session models, owner 2026-09-28):
	// the SERVER stamps the newborn from the strong slot.
	return `/chat/${id}?prompt=${encodeURIComponent(t)}`;
}

/** The pure shell (no router) — the render-test seam: the draft view's
 *  visible surface, assembled from the same pieces a fresh chat shows. */
/* FINISH-FIRST SEND + RUN-END FOCUS live in the shell (it owns the
 * dictation instance); the truth of the text stays in the parent, whose
 * send reads a REF mirror — see NewSession below. */
export function DraftShell({
	busy,
	text,
	onChange,
	onSend,
	setupCta,
	mode = "teach",
	picks = [],
	onOpenPicker,
	onClearPicks,
	overlay,
	onModeChange,
	pendingFiles = [],
	onPickFiles,
	onClearFiles,
	folderName,
	onLeaveFolder,
}: {
	/** The sidebar folder the session will be filed in (its + opened the draft). */
	folderName?: string;
	/** Start the session outside the folder instead. */
	onLeaveFolder?: () => void;
	/** Material picked before the chat exists (uploaded on send). */
	pendingFiles?: readonly File[];
	onPickFiles?: (files: File[]) => void;
	onClearFiles?: () => void;
	busy: boolean;
	text: string;
	onChange: (v: string) => void;
	onSend: () => void;
	/** The practice draft (owner, 2026-10-04): ?mode=practice — the
	 *  created session carries kind:"practice" and the copy changes
	 *  (the practice agent opens; no probing). */
	mode?: SessionMode;
	/** The first-run CTA (fix wave chunk B): the same "Set up your models"
	 *  affordance home carries, rendered above the draft shell — passed by
	 *  NewSession, which owns the configured state and the SetupDialog. */
	setupCta?: ReactNode;
	/** THE PICK BAR (owner round 10): the SAME pill the home screen
	 *  carries above its composer — dashed "Pick nodes" when empty,
	 *  count + Clear when picked. The draft screen has
	 *  no graph behind it, so the picker opens the standalone chain-table
	 *  overlay over fetched snapshot data (owned by NewSession). */
	picks?: DraftPick[];
	onOpenPicker?: () => void;
	onClearPicks?: () => void;
	/** THE PICKER SLOT (owner round 10b): the chain-table overlay hosts
	 *  INSIDE the content column's relative container — the same law as
	 *  the graph view (the overlay fills its column, never the sidebar).
	 *  Passed as a node so the pick state stays in NewSession. */
	overlay?: ReactNode;
	/** The in-card Teach | Practice switch. */
	onModeChange?: (mode: SessionMode) => void;
}) {
	// Voice dictation (STT wave, 2026-09-17): finals append at the end of the
	// draft text (via the parent's onChange — the truth lives there); the
	// strip lives in the stats bar's middle slot.
	// Tab navigates INTO the composer (owner, keyboard round 2026-10-06):
	// the only text field on this surface — the cycle's whole chain.
	const cycleComposer = useCallback((): readonly HTMLElement[] =>
		Array.from(document.querySelectorAll<HTMLElement>('[data-testid="composer"] textarea')),
		[]);
	useFieldCycle(cycleComposer);
	const dictation = useDictation({
		append: (t) => onChange(joinDictation(text, t)),
	});
	// A LIVE dictation keeps the composer sendable ("nothing gets lost"
	// round, owner 2026-10-01): the spoken text is deferred in the run's
	// buffer — Enter must reach the finish-first send, not be gated out by
	// an empty textarea. Nothing said → the send no-ops.
	const canSend = text.trim().length > 0 || dictation.active;
	/* FINISH DICTATION FIRST (owner, 2026-10-01): stop the run, let the
	 * last finals land through onChange, THEN call the parent's send —
	 * which reads its REF mirror, so the post-await timing of React's
	 * re-render cannot eat the dictated tail. */
	const handleSend = () => {
		if (dictation.active) {
			void dictation.finish().then(onSend);
			return;
		}
		onSend();
	};
	/* Run end focuses the composer (owner, 2026-10-01): the hands are on
	 * the keyboard from the stop — falling edge of `active` only. */
	const composerInputRef = useRef<HTMLTextAreaElement>(null);
	const dictationWasActiveRef = useRef(false);
	useEffect(() => {
		if (dictation.active) {
			dictationWasActiveRef.current = true;
		} else if (dictationWasActiveRef.current) {
			dictationWasActiveRef.current = false;
			composerInputRef.current?.focus();
		}
	}, [dictation.active]);
	return (
		/* CHROME-LESS CREATION SURFACE (owner round 11, 2026-10-05): the
		 * drafts join home's register — no TopBar, no title (the serif title
		 * always names a session; a draft has none). Home's proven pattern
		 * verbatim: a floating reopen toggle
		 * (the only pointer-events-auto spot), the empty state carrying the
		 * orientation. The chain picker then owns the column top exactly
		 * like the graph view's — no stacked bars. */
		<div className="relative flex h-dvh">
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="relative flex min-h-0 flex-1">
					{/* The hero: mark, the question, one card holding the input and
					    every control (layout after Perplexity's home). */}
					<SphereBackdrop />
					<div className="relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-[12vh] pt-16">
						<LhMark className="size-10 text-foreground" />
						<h1 className="mt-6 text-center text-3xl font-normal tracking-tight text-foreground sm:text-[2.1rem]">
							{mode === "practice" ? "What do you want to practice?" : "What do you want to learn?"}
						</h1>
						{folderName && (
							<div data-testid="draft-folder" className="mt-3 flex items-center gap-1.5 rounded-full bg-(--pill) py-1 pl-3 pr-1 text-sm text-muted-foreground">
								<FolderIcon className="size-3.5 shrink-0" />
								New session in <span className="max-w-[16rem] truncate font-medium text-foreground">{folderName}</span>
								<Hint label="Start it outside the folder" side="bottom">
									<button
										type="button"
										aria-label={`Start outside ${folderName}`}
										onClick={onLeaveFolder}
										className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-(--pill-hover) hover:text-foreground"
									>
										<XIcon className="size-3.5" />
									</button>
								</Hint>
							</div>
						)}
						<div className={`${DOCK} mt-9`}>
							{setupCta && <ComposerActions setup={setupCta} />}
							<div className={COMPOSER_SHELL}>
								<Composer
									busy={busy}
									value={text}
									onChange={onChange}
									onSend={handleSend}
									onStop={() => {}}
									canSend={canSend}
									inputRef={composerInputRef}
									autoFocus
									onEscape={dictation.active ? dictation.cancel : undefined}
									placeholder={
										mode === "practice"
											? "Describe a topic, or pick nodes from your graph…"
											: "Ask about any topic — the teacher starts by finding what you know…"
									}
									dictation={dictation}
									leading={
										mode === "practice" ? (
											<Hint label="Pick nodes from your graph" side="bottom">
												<button
													type="button"
													aria-label="Pick nodes from your graph"
													data-testid="practice-props-chip"
													onClick={onOpenPicker}
													className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-(--pill) hover:text-foreground"
												>
													<PlusIcon className="size-5" />
												</button>
											</Hint>
										) : undefined
									}
								/>
							</div>
							<StatsBar
								turns={[]}
								leadingSlot={
									<div className="flex items-center gap-2">
										<SessionModeToggle mode={mode} onChange={(m) => onModeChange?.(m)} testIdPrefix="draft-mode" />
										{onPickFiles && <AttachMaterialControl onPicked={onPickFiles} pasteTarget={composerInputRef} />}
										{pendingFiles.length > 0 && (
											<span data-testid="draft-materials" className="flex items-center gap-1 rounded-full bg-(--pill) py-0.5 pl-2.5 pr-0.5 text-sm text-foreground">
												{pendingFiles.length} {pendingFiles.length === 1 ? "file" : "files"} attached
												<button
													type="button"
													aria-label="Remove attached files"
													onClick={onClearFiles}
													className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-(--pill-hover) hover:text-foreground"
												>
													<XIcon className="size-3.5" />
												</button>
											</span>
										)}
										{picks.length > 0 && (
											<span className="flex items-center gap-1 rounded-full bg-(--pill) py-0.5 pl-2.5 pr-0.5 text-sm text-foreground">
												{picks.length} {picks.length === 1 ? "node" : "nodes"}
												<button
													type="button"
													aria-label="Clear picked nodes"
													data-testid="practice-props-clear"
													onClick={onClearPicks}
													className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-(--pill-hover) hover:text-foreground"
												>
													<XIcon className="size-3.5" />
												</button>
											</span>
										)}
									</div>
								}
							/>
						</div>
					</div>
					{overlay}
				</div>
			</div>
			{/* The floating reopen toggle — pointer-events-none except the
			    toggle itself (home's pattern), painted AFTER the overlay's
			    column so nothing of it blocks the canvas area. */}
			<header className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 px-3 py-2">
				<div className="pointer-events-auto">
					<SidebarToggle />
				</div>
			</header>
		</div>
	);
}

export function NewSession({ initialConfigured, mode = "teach", folderId }: { initialConfigured: boolean; mode?: SessionMode; folderId?: string }) {
	const router = useRouter();
	const [text, setText] = useState("");
	// The folder the draft was opened from, by name (an unknown id shows
	// nothing — the server files the chat only into a folder that exists).
	const [folderName, setFolderName] = useState<string | undefined>(undefined);
	useEffect(() => {
		setFolderName(undefined);
		if (!folderId) return;
		let live = true;
		void fetch("/api/folders", { cache: "no-store" })
			.then((r) => (r.ok ? (r.json() as Promise<{ folders: ChatFolder[] }>) : { folders: [] }))
			.then(({ folders }) => {
				if (live) setFolderName(folders.find((f) => f.id === folderId)?.name);
			})
			.catch(() => {
				/* unreachable: the draft still files the chat on send */
			});
		return () => {
			live = false;
		};
	}, [folderId]);
	// Material picked before the session exists: attached on send.
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	/* The draft MIRROR ("nothing gets lost" round, 2026-10-01): the shell's
	 * finish-first send calls THIS send after the dictation flush — which
	 * landed via setState and may not have re-rendered yet. The send reads
	 * the mirror; every write keeps it current. */
	const textRef = useRef("");
	const applyText = (v: string) => {
		textRef.current = v;
		setText(v);
	};
	const [busy, setBusy] = useState(false);
	// THE PICK BAR (owner round 10): the draft's lifted pick set + the
	// snapshot the standalone chain-table picker reads. Lazy — the graph
	// is fetched on FIRST open only, then reused.
	const [picks, setPicks] = useState<DraftPick[]>([]);
	const picksRef = useRef<DraftPick[]>([]);
	const applyPicks = (next: DraftPick[]) => {
		picksRef.current = next;
		setPicks(next);
	};
	const [pickerOpen, setPickerOpen] = useState(false);
	const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
	const openPicker = () => {
		if (snapshot) {
			setPickerOpen(true);
			return;
		}
		void fetch("/api/graph")
			.then((r) => r.json() as Promise<GraphSnapshot>)
			.then((snap) => {
				setSnapshot(snap);
				setPickerOpen(true);
			})
			.catch(() => {
				/* an unreachable graph leaves the draft usable — pickless */
			});
	};

	// First-run gate (model-slots wave, owner 2026-09-20): the send
	// INTERCEPTS into the setup flow while unconfigured — no defaults for
	// 33 providers, chats cannot start. The draft stays in the textarea;
	// Save stores the slots and never sends (owner ruling 2026-10-09) —
	// the learner sends the draft themselves.
	const [configured, setConfigured] = useState(initialConfigured);
	// The zero-keys truth (zero-keys wave): no provider key = the pill
	// takes precedence over the models CTA (keys come first in the chain).
	const zeroKeys = useZeroKeys();
	// The strong slot's keyless truth (pre-send key guards, owner interlude
	// 2026-09-25): keys may exist generally while the STRONG slot's pinned
	// provider has none — the same skip-everything treatment on send.
	const strongKeyless = useStrongKeyless();
	const [setupOpen, setSetupOpen] = useState(false);

	const send = useCallback(() => {
		const draft = textRef.current.trim();
		if (!draft || busy) return;
		if (!configured) {
			setSetupOpen(true);
			return;
		}
		// The pre-send KEY guards (owner interlude, no-orphan-chats): guard
		// BEFORE startDraftSession creates the record — a refused first
		// send would otherwise leave an orphan error-shell chat in the
		// sidebar. Same skip-everything-and-open-setup treatment; the
		// server's 503 gate remains the belt for /chat/[id] sessions.
		if (zeroKeys || strongKeyless) {
			setSetupOpen(true);
			return;
		}
		setBusy(true);
		void startDraftSession(draft, fetch, mode === "teach" ? undefined : mode, mode === "practice" ? picksRef.current : undefined, folderId, pendingFiles)
			.then((target) => {
				if (target) router.push(target);
				else setBusy(false);
			})
			.catch(() => setBusy(false));
	}, [busy, router, configured, zeroKeys, strongKeyless, mode, folderId, pendingFiles]);

	return (
		<>
			<DraftShell
				busy={busy}
				text={text}
				onChange={applyText}
				onSend={send}
				mode={mode}
				onModeChange={(m) => {
					// Switching mode keeps the folder the draft was started from.
					const q = new URLSearchParams();
					if (m !== "teach") q.set("mode", m);
					if (folderId) q.set("folder", folderId);
					const qs = q.toString();
					router.replace(qs ? `/chat/new?${qs}` : "/chat/new");
				}}
				folderName={folderName}
				onLeaveFolder={() => router.replace(mode === "teach" ? "/chat/new" : `/chat/new?mode=${mode}`)}
				pendingFiles={pendingFiles}
				onPickFiles={(files) => setPendingFiles((prev) => [...prev, ...files])}
				onClearFiles={() => setPendingFiles([])}
				picks={picks}
				onOpenPicker={openPicker}
				onClearPicks={() => applyPicks([])}
				overlay={
					// THE PICKER (owner round 10b): hosted INSIDE the content
					// column — absolute inset-0 resolves to the column's relative
					// container, the same confinement the graph view gives it;
					// never over the sidebar.
					<ChainTableOverlay
						open={pickerOpen}
						nodes={snapshot?.propositions ?? []}
						chains={snapshot?.chains ?? []}
						sessions={snapshot?.sessions ?? {}}
						fileSources={snapshot?.fileSources ?? {}}
						onClose={() => setPickerOpen(false)}
						selectMode
						controlledSelection={new Set(picks.map((p) => p.id))}
						onSelectionChange={(ids) => {
							const byId = new Map((snapshot?.propositions ?? []).map((n) => [n.id, n]));
							const next: DraftPick[] = [];
							for (const id of ids) {
								const n = byId.get(id);
								if (n) next.push({ id: n.id, name: n.name, statement: n.statement });
							}
							applyPicks(next);
						}}
					/>
				}
				setupCta={
					zeroKeys ? (
						<ZeroKeysPill inline onOpen={() => setSetupOpen(true)} />
					) : (
						!configured && (
							<button
								type="button"
								data-testid="setup-cta"
								onClick={() => setSetupOpen(true)}
								className="rounded-sm border border-border bg-card px-3 py-1.5 font-ui text-xs text-foreground transition-colors hover:border-muted-foreground/50 hover:bg-accent cursor-pointer"
							>
								Set up your models
							</button>
						)
					)
				}
			/>
			{/* First-run setup: the send interception's landing surface — stage
			    1 is the self-contained first-key screen (zero-keys wave). */}
			<SetupDialog
				open={setupOpen}
				onClose={() => setSetupOpen(false)}
				onDone={() => {
					setConfigured(true);
					setSetupOpen(false);
					// Save only saves (owner ruling 2026-10-09): the draft
					// waits in the composer; the learner sends it.
				}}
				/>
		</>
	);
}