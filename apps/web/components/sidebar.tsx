
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/navigation";
import { usePathname, useRouter } from "@/lib/navigation";
import { useSearchParams } from "react-router";
import { MenuShell } from "@/components/menu-shell";
import { DeleteSessionDialog } from "@/components/delete-session-dialog";
import type { ChatDeleteMode, ChatFolder } from "@/src/core";
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, DumbbellIcon, FolderIcon, FolderPlusIcon, FolderTreeIcon, MoreHorizontalIcon, NetworkIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon, SearchIcon, SettingsIcon, XIcon } from "lucide-react";
import { FolderMaterials } from "@/components/material-cards";

/** Sidebar navigation rows (after the Meta Model API console): icon +
 *  label, grey hover, blue-tinted when active. */
/** Square ghost icon button for the chrome rows (top row, bottom row). */
const CHROME_ICON =
	"flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-(--pill) hover:text-foreground";
const NAV_ROW =
	"flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] text-foreground transition-colors hover:bg-(--pill) focus-visible:outline-2 focus-visible:outline-primary";
const NAV_ROW_ACTIVE = "bg-(--pill) hover:bg-(--pill)";
import { ActivitySection } from "@/components/activity-dock";
import { CoverageMenuBlock } from "@/components/extraction-coverage";
import { LhMark } from "@/components/lh-mark";
import { BrailleSpinner } from "@/components/braille-spinner";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { SettingsDialogProvider, useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { Hint } from "@/components/ui/hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fuzzyScore } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { openSearchPalette, SearchPalette } from "@/components/search-palette";
import type { ChatListItem } from "@/src/core";
import { kbdEventForAction } from "@/src/core";

/**
 * Toggleable sidebar — NOT a modal drawer: no backdrop, no focus theft. It
 * sits inline next to the content and can stay open while working in a
 * session. Open state persists across pages (provider lives in the root
 * layout) and across reloads (localStorage).
 */

const STORAGE_KEY = "lh:sidebar-open";

/** Phone-width browser windows: the sidebar becomes a slide-over drawer
 *  (backdrop, closes after navigating) instead of an inline column that
 *  would leave no room for the page. */
const MOBILE_QUERY = "(max-width: 767px)";

const SidebarContext = createContext<{ open: boolean; toggle: () => void; mobile: boolean; close: () => void }>({
	open: false,
	toggle: () => {},
	mobile: false,
	close: () => {},
});

export function useSidebar() {
	return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
	// Start closed so server and client first-render agree (no hydration
	// mismatch); the stored value is applied after mount.
	const [open, setOpen] = useState(false);
	const [mounted, setMounted] = useState(false);
	// Drawer state on phones — separate from the persisted desktop
	// preference, always starts closed.
	const [mobile, setMobile] = useState(
		() => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches,
	);
	const [drawerOpen, setDrawerOpen] = useState(false);

	useEffect(() => {
		const mq = window.matchMedia(MOBILE_QUERY);
		const onChange = () => {
			setMobile(mq.matches);
			setDrawerOpen(false);
		};
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	useEffect(() => {
		// Post-mount only — server HTML and first client render must agree.
		const stored = localStorage.getItem(STORAGE_KEY);
		// Default: open (first run introduces the sidebar).
		setOpen(stored === null ? true : stored === "1");
		setMounted(true);
	}, []);

	const toggle = useCallback(() => {
		if (mobile) {
			setDrawerOpen((v) => !v);
			return;
		}
		setOpen((v) => {
			localStorage.setItem(STORAGE_KEY, v ? "0" : "1");
			return !v;
		});
	}, [mobile]);

	const close = useCallback(() => setDrawerOpen(false), []);

	// Escape closes the drawer (it's modal on phones).
	useEffect(() => {
		if (!mobile || !drawerOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setDrawerOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [mobile, drawerOpen]);

	// ⌘B: the global shortcut dispatches kbdEventForAction("toggle-sidebar")
	// and the context answers on exactly that name — the shared spelling
	// is the fix for the interlude bug (the listener sat on the pre-
	// convention name "lh:toggle-sidebar" while the dispatcher sent
	// "lh:kbd-toggle-sidebar", so ⌘B silently did nothing; owner
	// 2026-09-25).
	useEffect(() => {
		const event = kbdEventForAction("toggle-sidebar");
		const onToggle = () => toggle();
		window.addEventListener(event, onToggle);
		return () => window.removeEventListener(event, onToggle);
	}, [toggle]);

	return (
		<SidebarContext.Provider value={{ open: mobile ? drawerOpen : open, toggle, mobile, close }}>
			{/* transitions gated on mount: no slide-in flash on page load.
			    lh-safe-shell pads the whole app clear of notches and the
			    home indicator (app/globals.css). */}
			<div
				className={cn(
					"lh-safe-shell flex h-dvh",
					mounted && "[&_.sidebar-motion]:transition-[width,margin,opacity,transform]",
				)}
			>
				{children}
			</div>
		</SidebarContext.Provider>
	);
}

/** Hamburger for page headers — only visible when the sidebar is closed.
 *
 *  Owner, round 6c: the toggle is ALWAYS MOUNTED, owning a slot whose
 *  width+margin animate in LOCKSTEP with the sidebar's own width
 *  transition (same duration-200, same easing, both gated on mount) —
 *  before, it mounted/unmounted in one frame, so its 48px footprint
 *  (button + gap) popped and dragged the title and chips sideways while
 *  the sidebar was still mid-slide. When open the slot is exactly zero
 *  (w-0 -mr-3: width 0, the negative margin cancels the header's gap-3),
 *  so resting layouts are pixel-identical to the old conditional render.
 *  The icon fades with the slot and is clipped by it as it collapses —
 *  no popping in either direction. */
export function SidebarToggle() {
	const { open: sidebarOpen, toggle, mobile } = useSidebar();
	// On phones the drawer floats over the page, so the header's open
	// button stays put instead of collapsing away.
	const open = sidebarOpen && !mobile;
	return (
		<span
			className={cn(
				"sidebar-motion relative flex h-9 shrink-0 overflow-hidden duration-200",
				open ? "w-0 -mr-3" : "w-9 mr-0",
			)}
		>
			<Hint label="Open sidebar" action="toggle-sidebar">
			<Button
				variant="ghost"
				size="icon"
				aria-label="Open sidebar"
				aria-hidden={open}
				tabIndex={open ? -1 : 0}
				onClick={toggle}
				className={cn("sidebar-motion duration-200", open ? "pointer-events-none opacity-0" : "opacity-100")}
			>
				{/* Owner, round 6: size-4, SAME as the close glyph — the toggle
				    must not grow when the sidebar is closed (it did: size-5 here).
				    The small look is the standard, both directions. */}
				<PanelLeftOpenIcon className="size-4" />
			</Button>
			</Hint>
		</span>
	);
}

/**
 * The row's status indicator (owner, minimal-color round): the braille
 * spinner, ONLY while a teach turn is in flight — monochrome motion, the
 * terminal's own glyph, existing exactly as long as the work does and
 * vanishing the moment it ends. Every other state renders NOTHING:
 * phases only advance (all sessions end in Teaching — phase-as-signal was
 * decoration, now retired app-wide), and question-pending is the dominant
 * RESTING state of real sessions — a resting state has no scan value, so
 * the meta line's "Waiting for input" text carries it. Idle is the
 * absence of a signal, by design.
 */
function SessionStatus({ busy }: { busy: boolean }) {
	if (!busy) return null;
	return <BrailleSpinner />;
}

/** Compact "how long ago": "just now", "5m ago", "3h ago", "2d ago",
 *  then a plain date. How long a session has been WAITING matters more
 *  than an absolute timestamp. Beyond a week the date renders ISO
 *  (YYYY-MM-DD, zero-padded) — the international standard: unambiguous
 *  in any locale and it sorts (owner, typography round 5; the old
 *  M/D/YYYY was the US convention. A user-locale setting can come later
 *  — trivial, a format function swap). Pure — exported for tests. */
export function timeAgo(iso: string, now = new Date()): string {
	const ms = now.getTime() - new Date(iso).getTime();
	if (ms < 60_000) return "just now";
	const min = Math.floor(ms / 60_000);
	if (min < 60) return `${min}m ago`;
	const h = Math.floor(min / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 7) return `${d}d ago`;
	const date = new Date(iso);
	const mm = String(date.getMonth() + 1).padStart(2, "0");
	const dd = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${mm}-${dd}`;
}

/** The row's second line: the state when a state exists (waiting/working),
 *  otherwise just how long ago. The message count is DROPPED (owner,
 *  typography round 5): it informed no decision — clutter. messageCount
 *  still rides the API payload, so this is a one-line flip back if it's
 *  ever wanted. */
function sessionMeta(chat: ChatListItem): string {
	if (chat.compacting) return `Compacting context · ${timeAgo(chat.updatedAt)}`;
	if (chat.pendingQuestion) return `Waiting for input · ${timeAgo(chat.updatedAt)}`;
	if ((chat.kind ?? "teach") === "practice" && chat.pendingProblem) {
		return `Problem waiting · ${timeAgo(chat.updatedAt)}`;
	}
	if (chat.busy) return "Working…";
	return timeAgo(chat.updatedAt);
}

/**
 * One session row: the status spinner (only while working), then title +
 * state-aware meta. Exported for render tests — pure function of the
 * list item.
 */
export function SessionRow({
	chat,
	active,
	onOpen,
	kbdSelected = false,
	onContextMenu,
	onDragStart,
}: {
	chat: ChatListItem;
	active: boolean;
	onOpen: () => void;
	/** Set to make the row draggable (drag a chat onto a folder). */
	onDragStart?: (e: React.DragEvent<HTMLButtonElement>) => void;
	/** Keyboard-cycle highlight (shortcut wave A: Alt+↑/↓ + Alt+Enter) —
	 *  visually distinct from the active session, which stays filled. */
	kbdSelected?: boolean;
	/** Right-click opens the context menu (wave 6: Rename / Delete). */
	onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
	return (
		<button
			type="button"
			onClick={onOpen}
			onContextMenu={onContextMenu}
			draggable={onDragStart ? true : undefined}
			onDragStart={onDragStart}
			data-testid={kbdSelected ? "session-row-kbd" : "session-row"}
			// One line per session; the state + age ride the tooltip.
			title={sessionMeta(chat)}
			className={cn(
				"relative mb-0.5 flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left transition-colors hover:bg-(--pill)",
				active && "bg-(--pill) hover:bg-(--pill)",
				kbdSelected && !active && "bg-accent/60 ring-1 ring-border",
			)}
		>
			<span className={cn("min-w-0 flex-1 truncate text-[15px]", active ? "text-foreground" : "text-foreground/90")}>{chat.title}</span>
			<span className="sr-only">{sessionMeta(chat)}</span>
			{/* Right-edge state: the spinner while working, a dot while the
			    session waits on the learner, the dumbbell for practice. */}
			<SessionStatus busy={chat.busy || chat.compacting} />
			{!(chat.busy || chat.compacting) && (chat.pendingQuestion || ((chat.kind ?? "teach") === "practice" && chat.pendingProblem)) && (
				<span className="size-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
			)}
			{(chat.kind ?? "teach") === "practice" && (
				<DumbbellIcon className="size-3.5 shrink-0 text-muted-foreground/70" aria-label="Practice session" />
			)}
		</button>
	);
}

/** The inline-rename row (wave 6): same geometry as SessionRow, but the
 *  title line becomes a text input — select-all on entry (the click means
 *  "replace", the header rename's rule), Enter/blur commits, Esc discards.
 *  The meta line stays so the row never changes height mid-edit. */
export function RenameRow({ chat, onCommit, onCancel }: { chat: ChatListItem; onCommit: (next: string) => void; onCancel: () => void }) {
	const [draft, setDraft] = useState(chat.title);
	const inputRef = useRef<HTMLInputElement | null>(null);
	useEffect(() => {
		const el = inputRef.current;
		if (el) {
			el.focus();
			el.select();
		}
	}, []);
	return (
		<div
			data-testid="session-rename-row"
			className="relative mb-0.5 flex h-9 w-full items-center rounded-lg bg-accent px-3"
		>
			{/* NOTHING MOVES (owner, polish round): an idle row renders no
			    status spacer (SessionStatus is null when not busy), so the
			    title starts at the row's own px-3 — 12px in. The old rename
			    row always carried a 14px spacer + gap + the input's border
			    and padding, landing the text ~41px in (and the meta with
			    it). The input here is borderless and padding-free at the
			    exact title x; the underline is the only editing cue. */}
			<span className="flex min-w-0 w-full flex-col">
				<input
					ref={inputRef}
					value={draft}
					spellCheck={false}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={() => onCommit(draft)}
					onKeyDown={(e) => {
						if (e.key === "Enter") e.currentTarget.blur();
						if (e.key === "Escape") {
							e.stopPropagation(); // discard, not also the sidebar/chat chains
							onCancel();
						}
					}}
					aria-label="Rename session"
					data-testid="session-rename-input"
					className="lh-input w-full min-w-0 truncate border-0 border-b border-border bg-transparent px-0 text-foreground outline-none"
				/>
			</span>
		</div>
	);
}

/** The three-way kind filter (practice sessions, owner 2026-10-04):
 *  Teaching / All / Practice — a client-side filter over the same
 *  snapshot, persisted in localStorage, defaulting to All. */
export type SessionKindFilter = "teach" | "all" | "practice";
const KIND_FILTER_KEY = "lh:session-kind-filter";
/** Folder ids the user collapsed in the sidebar (per browser). */
const COLLAPSED_FOLDERS_KEY = "lh:collapsed-folders";
/** The drop target that makes a new folder around the dragged chat. */
const NEW_FOLDER_DROP = "__new_folder__";
const MENU_ITEM = "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-accent";

function SessionsSidebar() {
	const { open, toggle, mobile, close } = useSidebar();
	const [chats, setChats] = useState<ChatListItem[] | null>(null);
	const [folders, setFolders] = useState<ChatFolder[]>([]);
	const [query, setQuery] = useState("");
	const [kindFilter, setKindFilter] = useState<SessionKindFilter>("all");
	useEffect(() => {
		const stored = window.localStorage.getItem(KIND_FILTER_KEY);
		if (stored === "teach" || stored === "all" || stored === "practice") setKindFilter(stored);
	}, []);
	const setFilter = useCallback((f: SessionKindFilter) => {
		setKindFilter(f);
		window.localStorage.setItem(KIND_FILTER_KEY, f);
	}, []);
	const pathname = usePathname();
	const [searchParams] = useSearchParams();
	// Phones: leaving the page closes the drawer, so the destination shows.
	const searchKey = searchParams.toString();
	useEffect(() => {
		close();
	}, [pathname, searchKey, close]);
	// A draft opened from a folder's + (/chat/new?folder=): it shows as the
	// folder's "New session" row instead of lighting the top New session.
	const draftFolderId = pathname === "/chat/new" ? searchParams.get("folder") : null;
	const router = useRouter();
	const { open: openSettings } = useSettingsDialog();

	/* New session (owner, 2026-09-13): NO POST — the button opens the
	   sessionless draft view; the session is created only when the first
	   message is sent (and that message becomes its title). Search: a
	   client-side filter over the poll snapshot — no server round trip. */
	const newSession = useCallback(() => {
		router.push("/chat/new");
	}, [router]);

	/* FUZZY (owner round 8, 2026-10-05): subsequence match ranked by
	 * fuzzyScore — prefix beats word-boundary beats scattered. Empty query
	 * keeps the natural list order (scores are all 0, sort is stable). */
	const shown = useMemo(() => {
		const q = query.trim();
		let list = chats;
		if (list && kindFilter !== "all") {
			list = list.filter((c) => (c.kind ?? "teach") === kindFilter);
		}
		if (!list) return list;
		if (!q) return list;
		return list
			.map((c) => ({ c, score: fuzzyScore(q, c.title) }))
			.filter((r): r is { c: (typeof list)[number]; score: number } => r.score !== null)
			.sort((a, b) => b.score - a.score)
			.map((r) => r.c);
	}, [chats, query, kindFilter]);

	const refreshInFlightRef = useRef(false);
	const refresh = useCallback(async () => {
		// In-flight coalesce (S6): event bursts may land several refresh
		// calls at once — one fetch serves them all; anything newer arrives
		// with the next event's fetch.
		if (refreshInFlightRef.current) return;
		refreshInFlightRef.current = true;
		try {
			const [res, foldersRes] = await Promise.all([
				fetch("/api/chats", { cache: "no-store" }),
				fetch("/api/folders", { cache: "no-store" }),
			]);
			const d = (await res.json()) as { chats: ChatListItem[] };
			setChats(d.chats);
			if (foldersRes.ok) setFolders(((await foldersRes.json()) as { folders: ChatFolder[] }).folders);
		} catch {
			// a transient failure keeps the last snapshot
			setChats((prev) => prev ?? []);
		} finally {
			refreshInFlightRef.current = false;
		}
	}, []);

	/* Instant rename propagation (2026-09-17): the chat header's rename
	   commits dispatch lh:chat-renamed; patch the snapshot in place instead
	   of waiting for the 2.5s poll. */
	useEffect(() => {
		const onRenamed = (e: Event) => {
			const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail;
			setChats((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, title } : c)) : prev));
		};
		window.addEventListener("lh:chat-renamed", onRenamed);
		return () => window.removeEventListener("lh:chat-renamed", onRenamed);
	}, []);

	/* INSTANT TURN-STATE (owner, sidebar round 2026-10-02): the open
	   session broadcasts lh:turn-state the instant its turn starts
	   (submitted — the optimistic machine's own flip) and at settle —
	   busy mirrors the server's own definition (isTurnRunning), so the
	   patch is exact: spinner up the moment the action happens, cleared
	   and refetched once at settle (title/order move with turns). The
	   events channel is the backstop for everything only the server
	   knows: other windows, wake turns in unopened sessions. A start on
	   a chat not yet in the snapshot (a brand-new session) = one
	   immediate refresh instead of a patch. */
	const chatsRef = useRef(chats);
	chatsRef.current = chats;
	useEffect(() => {
		const onTurnState = (e: Event) => {
			const { id, running } = (e as CustomEvent<{ id: string; running: boolean }>).detail;
			if (running) {
				if (chatsRef.current?.some((c) => c.id === id)) {
					setChats((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, busy: true } : c)) : prev));
				} else {
					void refresh(); // the brand-new session: it isn't in the snapshot yet
				}
				return;
			}
			setChats((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, busy: false } : c)) : prev));
			void refresh(); // settle: the server snapshot is now truthful — land it now
		};
		window.addEventListener("lh:turn-state", onTurnState);
		return () => window.removeEventListener("lh:turn-state", onTurnState);
	}, [refresh]);

	/* PUSH (architecture S6, 2026-10-02): the 2.5s poll is RETIRED — the
	   last standing network poll in the app. List truth arrives as
	   events: chats-changed (create/rename/delete — the list-SHAPE
	   writes), and turn-started/turn-settled for EVERY chat (unfiltered:
	   any chat's turn flips busy/order/phase in this list). Announced
	   fetches ride the 250ms trailing debounce (the S4/S5 law); resync
	   (reconnect / dev-restart) is immediate. lh:turn-state +
	   lh:chat-renamed stay for same-tab INSTANTS — local beats any
	   round-trip. */
	const refreshRef = useRef(refresh);
	refreshRef.current = refresh;
	const eventDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const scheduleEventRefresh = () => {
		if (eventDebounceRef.current) clearTimeout(eventDebounceRef.current);
		eventDebounceRef.current = setTimeout(() => {
			eventDebounceRef.current = undefined;
			void refreshRef.current();
		}, 250);
	};
	useServerEvent("chats-changed", scheduleEventRefresh);
	useServerEvent("turn-started", scheduleEventRefresh);
	useServerEvent("turn-settled", scheduleEventRefresh);
	useServerEvent("compaction-changed", scheduleEventRefresh);
	useServerResync(() => void refreshRef.current());
	useEffect(
		() => () => {
			if (eventDebounceRef.current) clearTimeout(eventDebounceRef.current);
		},
		[],
	);

	/* ── Keyboard seams (shortcut wave A, 2026-09-17; search-walk round
	   2026-10-10) ── ⌘⇧F focuses the search field — and THE SEARCH OWNS THE
	   WALK: ↑/↓ cycle the filtered list (wrap — "cycle"), Enter opens the
	   walked row, or the FIRST match when nothing is walked (owner,
	   2026-10-10 — the quick-open pattern: ⌘⇧F, type, Enter, done). The
	   Alt+↑/↓/↵ global cycle was RETIRED the same round: barely used,
	   felt laggy. The selection is a row index into `shown`, so the walk
	   follows whatever the query + kind filter leave. Mouse and keyboard
	   coexist: hovering doesn't claim, a click or an open clears the
	   selection. */
	const [kbdIndex, setKbdIndex] = useState<number | null>(null);
	const [searchOpen, setSearchOpen] = useState(false);
	const [filterMenu, setFilterMenu] = useState(false);
	const searchRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	/* ── Wave 6 chunk A: context menu + inline rename + deletion ──
	   Right-click a session row → MenuShell: the two management actions
	   first (owner ruling), then — below a hairline — the extraction
	   coverage block (owner-locked redesign 2026-09-24, order refined
	   2026-09-24: Rename/Delete on top, the numbers + manual Extract
	   affordance at the bottom). The anchor is the row that was
	   right-clicked — assigned into a ref before the state flip so the
	   shell measures it on its first (hidden) pass. */
	const [ctxChatId, setCtxChatId] = useState<string | null>(null);
	const ctxAnchorRef = useRef<HTMLElement | null>(null);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<ChatListItem | null>(null);

	const openContext = (e: React.MouseEvent<HTMLButtonElement>, chat: ChatListItem) => {
		e.preventDefault(); // suppress the native menu
		ctxAnchorRef.current = e.currentTarget;
		setCtxChatId(chat.id);
	};

	// The menu contract (agent-section's): any pointerdown outside the menu
	// or its row closes it; Esc is CLAIMED so it never also aborts a turn
	// or folds the sidebar. Right-clicking another row re-anchors: its
	// pointerdown closes this menu, its contextmenu opens the next.
	useEffect(() => {
		if (ctxChatId === null) return;
		const onPointerDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (target instanceof Element && target.closest("[data-lh-menu]")) return;
			if (ctxAnchorRef.current?.contains(target)) return;
			setCtxChatId(null);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				setCtxChatId(null);
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [ctxChatId]);

	// Inline rename (owner ruling, wave 6): the row swaps to a text input;
	// commit rides the SAME plumbing as the header rename — PUT the title,
	// then lh:chat-renamed patches every listener (this sidebar's own
	// listener patches the snapshot instantly; an open chat header hears
	// it too). Esc discards; empty commit discards (the header's rules).
	const commitRename = useCallback(async (id: string, next: string) => {
		setRenamingId(null);
		const t = next.trim();
		if (t === "") return;
		try {
			const res = await fetch(`/api/chats/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: t }),
			});
			if (!res.ok) throw new Error(`rename failed: ${res.status}`);
			window.dispatchEvent(new CustomEvent("lh:chat-renamed", { detail: { id, title: t } }));
		} catch (err) {
			console.error("rename failed:", err); // keep the old title
		}
	}, []);

	/* ── Folders (Obsidian-style, nestable): a session points at its folder
	   by id; a folder may sit inside another. Courses (2026-10-29) are
	   folders too — their plan chat first, then the concepts in the
	   course's teaching order. Drag a chat onto a folder (any part of its
	   row or its open list) to file it there; onto empty list space to
	   take it out; onto "New folder with this chat" to make one. ── */
	const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
	useEffect(() => {
		try {
			const stored = JSON.parse(window.localStorage.getItem(COLLAPSED_FOLDERS_KEY) ?? "[]") as unknown;
			if (Array.isArray(stored)) setCollapsedFolders(new Set(stored.filter((x): x is string => typeof x === "string")));
		} catch {
			// a bad stored value just means every folder starts open
		}
	}, []);
	const setFolderCollapsed = useCallback((id: string, collapsed: boolean) => {
		setCollapsedFolders((prev) => {
			const next = new Set(prev);
			if (collapsed) next.add(id);
			else next.delete(id);
			try {
				window.localStorage.setItem(COLLAPSED_FOLDERS_KEY, JSON.stringify([...next]));
			} catch {
				/* storage unavailable: the state lives for this view only */
			}
			return next;
		});
	}, []);
	// The draft's folder opens (with every folder above it) so its row
	// shows — once per arrival, so the learner can still collapse it.
	const expandedDraftRef = useRef<string | null>(null);
	useEffect(() => {
		if (!draftFolderId) {
			expandedDraftRef.current = null;
			return;
		}
		if (expandedDraftRef.current === draftFolderId || folders.length === 0) return;
		expandedDraftRef.current = draftFolderId;
		let id: string | undefined = draftFolderId;
		for (let depth = 0; id && depth < 32; depth++) {
			setFolderCollapsed(id, false);
			id = folders.find((f) => f.id === id)?.parentId;
		}
	}, [draftFolderId, folders, setFolderCollapsed]);
	const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
	const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
	const folderMenuAnchorRef = useRef<HTMLElement | null>(null);
	const [materialsFolderId, setMaterialsFolderId] = useState<string | null>(null);

	const moveToFolder = useCallback(async (chatId: string, folderId: string | null) => {
		setChats((prev) => (prev ? prev.map((c) => (c.id === chatId ? { ...c, folderId: folderId ?? undefined } : c)) : prev));
		if (folderId) setFolderCollapsed(folderId, false);
		try {
			const res = await fetch(`/api/chats/${chatId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ folderId }),
			});
			if (!res.ok) throw new Error(`move failed: ${res.status}`);
		} catch (err) {
			console.error("move to folder failed:", err);
			void refreshRef.current();
		}
	}, [setFolderCollapsed]);

	const createFolder = useCallback(async (moveChatId?: string, parentId?: string) => {
		try {
			const res = await fetch("/api/folders", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "New folder", ...(parentId ? { parentId } : {}) }),
			});
			if (!res.ok) throw new Error(`create folder failed: ${res.status}`);
			const { folder } = (await res.json()) as { folder: ChatFolder };
			setFolders((prev) => [...prev, folder]);
			setFolderCollapsed(folder.id, false);
			if (parentId) setFolderCollapsed(parentId, false);
			setRenamingFolderId(folder.id);
			if (moveChatId) await moveToFolder(moveChatId, folder.id);
		} catch (err) {
			console.error("create folder failed:", err);
		}
	}, [setFolderCollapsed, moveToFolder]);

	const commitFolderRename = useCallback(async (id: string, next: string) => {
		setRenamingFolderId(null);
		const name = next.trim();
		if (name === "") return;
		setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
		try {
			const res = await fetch(`/api/folders/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			if (!res.ok) throw new Error(`rename folder failed: ${res.status}`);
		} catch (err) {
			console.error("rename folder failed:", err);
			void refreshRef.current();
		}
	}, []);

	const deleteFolder = useCallback(async (id: string) => {
		// The sessions and subfolders stay; they move up to its parent.
		const parentId = folders.find((f) => f.id === id)?.parentId;
		setFolders((prev) => prev.filter((f) => f.id !== id).map((f) => (f.parentId === id ? { ...f, parentId } : f)));
		setChats((prev) => (prev ? prev.map((c) => (c.folderId === id ? { ...c, folderId: parentId } : c)) : prev));
		try {
			const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
			if (!res.ok) throw new Error(`delete folder failed: ${res.status}`);
		} catch (err) {
			console.error("delete folder failed:", err);
			void refreshRef.current();
		}
	}, [folders]);

	const draggingIdRef = useRef<string | null>(null);
	const [dragging, setDragging] = useState(false);
	const [dropFolderId, setDropFolderId] = useState<string | null>(null);
	/** The drop target under the pointer: the innermost element marked
	 *  data-folder-drop (a folder's whole block, the new-folder row, a loose
	 *  chat row — "" = no folder). Empty list space reads as no folder. */
	const dropTargetOf = (e: React.DragEvent): string =>
		(e.target as HTMLElement).closest<HTMLElement>("[data-folder-drop]")?.dataset.folderDrop ?? "";
	const endDrag = () => {
		draggingIdRef.current = null;
		setDragging(false);
		setDropFolderId(null);
	};
	const onListDragOver = (e: React.DragEvent) => {
		if (!draggingIdRef.current) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		const target = dropTargetOf(e);
		setDropFolderId((prev) => (prev === target ? prev : target));
	};
	const onListDrop = (e: React.DragEvent) => {
		const chatId = draggingIdRef.current;
		const target = dropTargetOf(e);
		endDrag();
		if (!chatId) return;
		e.preventDefault();
		if (target === NEW_FOLDER_DROP) {
			void createFolder(chatId);
			return;
		}
		const chat = chatsRef.current?.find((c) => c.id === chatId);
		if (chat && (chat.folderId ?? "") !== target) void moveToFolder(chatId, target || null);
	};

	// The folder menu: same dismissal contract as the session menu.
	useEffect(() => {
		if (folderMenuId === null) return;
		const onPointerDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (target instanceof Element && target.closest("[data-lh-menu]")) return;
			if (folderMenuAnchorRef.current?.contains(target)) return;
			setFolderMenuId(null);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				setFolderMenuId(null);
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [folderMenuId]);

	// Delete success: patch the list instantly (the poll is the backstop),
	// navigate home if the open session died (the chat view unmounts —
	// drafts die with it, no orphan bubbles), and announce the graph
	// revision so the graph view refetches (deletion is the one writer
	// the status poll can't see — no run ever transitions some→none).
	const onDeleted = useCallback(
		(id: string, _mode: ChatDeleteMode, graphRevision: number) => {
			setDeleting(null);
			setChats((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
			if (pathname === `/chat/${id}`) router.push("/");
			window.dispatchEvent(new CustomEvent("lh:graph-revision", { detail: { revision: graphRevision } }));
		},
		[pathname, router],
	);

	// The sessions-search shortcut now opens the search palette
	// (components/search-palette.tsx listens for it directly).

	// Keep the kbd-selected row in view (the rows are the container's only
	// buttons, so the index matches).
	useEffect(() => {
		if (kbdIndex === null) return;
		listRef.current?.querySelectorAll("button")[kbdIndex]?.scrollIntoView({ block: "nearest" });
	}, [kbdIndex]);

	useEffect(() => {
		if (!open) return;
		void refresh();
		// Opening + navigation refetch; while open, the events channel owns
		// freshness (S6) — no interval, nothing standing.
	}, [open, pathname, refresh]);

	/* ── The list's rows: a chat, a folder (recursive), a folder's contents ── */
	const renderChat = (c: ChatListItem, i: number) =>
		renamingId === c.id ? (
			<RenameRow
				key={c.id}
				chat={c}
				onCommit={(next) => void commitRename(c.id, next)}
				onCancel={() => setRenamingId(null)}
			/>
		) : (
			<SessionRow
				key={c.id}
				chat={c}
				active={pathname === `/chat/${c.id}`}
				kbdSelected={i === kbdIndex}
				onOpen={() => {
					setKbdIndex(null);
					router.push(`/chat/${c.id}`);
				}}
				onContextMenu={(e) => openContext(e, c)}
				onDragStart={(e) => {
					draggingIdRef.current = c.id;
					setDragging(true);
					e.dataTransfer.effectAllowed = "move";
					e.dataTransfer.setData("text/plain", c.title);
				}}
			/>
		);

	/** A folder's rows: subfolders then chats — or, for a course folder,
	 *  its plan chat first, then concepts and composite subfolders in the
	 *  course's teaching order. */
	const folderContents = (folder: ChatFolder, inside: ChatListItem[], subfolders: ChatFolder[]): React.ReactNode => {
		if (!folder.planChatId) return [...subfolders.map((f) => renderFolder(f)), ...inside.map((c) => renderChat(c, -1))];
		const orderOf = (c: ChatListItem) => (c.id === folder.planChatId ? -2 : (c.course?.order ?? Number.MAX_SAFE_INTEGER));
		const subOrder = (f: ChatFolder) => (chats ?? []).find((c) => c.id === f.planChatId)?.course?.order ?? Number.MAX_SAFE_INTEGER;
		return [
			...inside.map((c) => ({ order: orderOf(c), node: renderChat(c, -1) })),
			...subfolders.map((f) => ({ order: subOrder(f), node: renderFolder(f) })),
		]
			.sort((a, b) => a.order - b.order)
			.map((item) => item.node);
	};

	const renderFolder = (folder: ChatFolder): React.ReactNode => {
		const inside = (shown ?? []).filter((c) => c.folderId === folder.id);
		const subfolders = folders.filter((f) => f.parentId === folder.id);
		const collapsed = collapsedFolders.has(folder.id);
		const Icon = folder.planChatId ? FolderTreeIcon : FolderIcon;
		return (
			<div
				key={folder.id}
				data-testid="folder-block"
				data-folder-drop={folder.id}
				className={cn("rounded-lg", dropFolderId === folder.id && "bg-primary/10 ring-1 ring-primary/40")}
			>
				{renamingFolderId === folder.id ? (
					<RenameRow
						chat={{ title: folder.name } as ChatListItem}
						onCommit={(next) => void commitFolderRename(folder.id, next)}
						onCancel={() => setRenamingFolderId(null)}
					/>
				) : (
					<div data-testid="folder-row" className="group relative mb-0.5 flex h-9 items-center gap-1 rounded-lg pl-2 pr-1 transition-colors hover:bg-(--pill)">
						<button
							type="button"
							aria-expanded={!collapsed}
							onClick={() => setFolderCollapsed(folder.id, !collapsed)}
							className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
						>
							<ChevronRightIcon className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", !collapsed && "rotate-90")} />
							<Icon className="size-4 shrink-0 text-muted-foreground" />
							<span className="min-w-0 flex-1 truncate text-[15px] text-foreground/90">{folder.name}</span>
						</button>
						<button
							type="button"
							aria-label={`New chat in ${folder.name}`}
							data-testid="folder-new-chat"
							onClick={() => router.push(`/chat/new?folder=${folder.id}`)}
							className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
						>
							<PlusIcon className="size-3.5" />
						</button>
						<button
							type="button"
							aria-label={`${folder.name} actions`}
							data-testid="folder-menu"
							onClick={(e) => {
								folderMenuAnchorRef.current = e.currentTarget;
								setFolderMenuId(folder.id);
							}}
							className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
						>
							<MoreHorizontalIcon className="size-3.5" />
						</button>
					</div>
				)}
				{!collapsed && (
					<div className="ml-3.5 border-l border-border/60 pl-1.5">
						{draftFolderId === folder.id && (
							<div
								data-testid="folder-draft-row"
								aria-current="page"
								className="relative mb-0.5 flex h-9 w-full items-center gap-2 rounded-lg bg-(--pill) px-3"
							>
								<span className="min-w-0 flex-1 truncate text-[15px] text-foreground">New session</span>
							</div>
						)}
						{draftFolderId === folder.id ? (
							folderContents(folder, inside, subfolders)
						) : inside.length === 0 && subfolders.length === 0 ? (
							<div className="px-3 py-1.5 text-xs text-muted-foreground">Empty — drag a chat here</div>
						) : (
							folderContents(folder, inside, subfolders)
						)}
					</div>
				)}
			</div>
		);
	};
	const menuFolder = folders.find((f) => f.id === folderMenuId) ?? null;
	const ctxChat = chats?.find((c) => c.id === ctxChatId) ?? null;

	return (
		<>
		{mobile && (
			<div
				aria-hidden="true"
				onClick={close}
				className={cn(
					"sidebar-motion fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] duration-200",
					open ? "opacity-100" : "pointer-events-none opacity-0",
				)}
			/>
		)}
		<aside
			className={cn(
				"sidebar-motion overflow-hidden duration-200",
				mobile
					? cn(
							"fixed inset-y-0 left-0 z-50 w-[min(18rem,calc(100vw-3rem))] shadow-2xl",
							open ? "translate-x-0" : "-translate-x-full",
						)
					: cn("shrink-0", open ? "w-72" : "w-0"),
			)}
			aria-hidden={!open}
			// Picking a destination on a phone closes the drawer, even when
			// it's the page already showing (no route change to catch).
			onClickCapture={(e) => {
				if (!mobile) return;
				const t = (e.target as HTMLElement).closest("a, [data-testid='session-row'], [data-testid='new-session']");
				if (t) close();
			}}
			{...(mobile && !open ? { inert: true } : {})}
		>
			<div
				className={cn(
					"flex h-full flex-col border-r bg-background",
					mobile ? "w-full pt-(--safe-top) pb-(--safe-bottom) pl-(--safe-left)" : "w-72",
				)}
			>
				{/* Top icon row: close, back, forward. */}
				<div className="flex h-15 shrink-0 items-center gap-0.5 px-3">
					<Hint label="Close sidebar" action="toggle-sidebar">
						<button type="button" aria-label="Close sidebar" onClick={toggle} className={CHROME_ICON}>
							<PanelLeftCloseIcon className="size-4" />
						</button>
					</Hint>
					<Hint label="Back" side="bottom">
						<button type="button" aria-label="Back" onClick={() => window.history.back()} className={CHROME_ICON}>
							<ChevronLeftIcon className="size-4" />
						</button>
					</Hint>
					<Hint label="Forward" side="bottom">
						<button type="button" aria-label="Forward" onClick={() => window.history.forward()} className={CHROME_ICON}>
							<ChevronRightIcon className="size-4" />
						</button>
					</Hint>
				</div>

				{/* Two doors, STACKED (owner round 8, 2026-10-05 — was a
				    half/half row): full-width rows read cleaner and give the
				    labels room; teaching keeps the original draft route,
				    practice carries its mode. */}
				<nav className="mx-2 flex flex-col gap-0.5" aria-label="Main">
					<button
						type="button"
						data-testid="new-session"
						onClick={() => void newSession()}
						className={cn(NAV_ROW, pathname === "/chat/new" && !draftFolderId && NAV_ROW_ACTIVE)}
					>
						<PlusIcon className="size-[18px] shrink-0" />
						New session
						<span className="sr-only">start a new teaching or practice session</span>
					</button>
					<Hint label="Search" action="sessions-search" side="right">
						<button
							type="button"
							data-testid="nav-search"
							aria-haspopup="dialog"
							onClick={openSearchPalette}
							className={NAV_ROW}
						>
							<SearchIcon className="size-[18px] shrink-0" />
							Search
						</button>
					</Hint>
					<Link
						href="/"
						data-testid="nav-graph"
						aria-current={pathname === "/" ? "page" : undefined}
						className={cn(NAV_ROW, pathname === "/" && NAV_ROW_ACTIVE)}
					>
						<NetworkIcon className="size-[18px] shrink-0" />
						Knowledge graph
					</Link>
				</nav>

				{/* Section heading — the list's scope, as a quiet dropdown
				    ("All sessions ▾"), the project-heading pattern. */}
				<div className="relative mx-2 mt-5 mb-1 flex items-center px-3" data-testid="session-kind-filter">
					<button
						type="button"
						data-testid="kind-filter-menu"
						aria-expanded={filterMenu}
						onClick={() => setFilterMenu((v) => !v)}
						className="-mx-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-(--pill) hover:text-foreground"
					>
						{kindFilter === "teach" ? "Teaching sessions" : kindFilter === "practice" ? "Practice sessions" : "All sessions"}
						<ChevronDownIcon className="size-3.5" />
					</button>
					<Hint label="New folder" side="top">
						<button
							type="button"
							data-testid="new-folder"
							aria-label="New folder"
							onClick={() => void createFolder()}
							className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-(--pill) hover:text-foreground"
						>
							<FolderPlusIcon className="size-4" />
						</button>
					</Hint>
					{filterMenu && (
						<>
							<div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setFilterMenu(false)} />
							<div className="absolute left-2 top-full z-50 mt-1 flex w-44 flex-col rounded-xl border bg-popover p-1 text-sm shadow-xl">
								{(["all", "teach", "practice"] as const).map((f) => (
									<button
										key={f}
										type="button"
										data-testid={`kind-filter-${f}`}
										onClick={() => {
											setFilter(f);
											setFilterMenu(false);
										}}
										className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-accent"
									>
										{f === "teach" ? "Teaching" : f === "all" ? "All" : "Practice"}
										{kindFilter === f && <CheckIcon className="size-3.5 text-muted-foreground" />}
									</button>
								))}
							</div>
						</>
					)}
				</div>

				{(searchOpen || query) && (
					<div className="mx-2 mb-1 px-1">
						<span className="relative block">
						<Input
							ref={searchRef}
							data-testid="session-search"
							value={query}
							onChange={(e) => {
								setQuery(e.target.value);
								// The list reorders under the query every keystroke —
								// a stale walk index would point at the wrong row.
								setKbdIndex(null);
							}}
							// THE SEARCH OWNS THE WALK (owner, 2026-10-10 — the
							// retired Alt+↑/↓/↵ cycle's successor): ↑/↓ cycle the
							// filtered rows (wrap), Enter opens the walked row —
							// or the FIRST match when nothing is walked (the
							// quick-open pattern) — then blurs (focus returns to
							// the app per the Enter law; the query stays for
							// re-searching). Esc leaves the search (owner,
							// keyboard wave): blur back to normal, and claim the
							// key so the window Esc chain (dictation / abort)
							// doesn't also fire.
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									e.stopPropagation();
									setQuery("");
									setSearchOpen(false);
									e.currentTarget.blur();
									return;
								}
								// Modified keys belong to the surface (⇧↵ etc.).
								if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
								const n = shown?.length ?? 0;
								if (n === 0) return;
								if (e.key === "ArrowDown" || e.key === "ArrowUp") {
									// The rows move, not the caret.
									e.preventDefault();
									const dir = e.key === "ArrowDown" ? 1 : -1;
									setKbdIndex((i) =>
										i === null || i >= n ? (dir === 1 ? 0 : n - 1) : (i + dir + n) % n,
										);
									return;
								}
								if (e.key === "Enter") {
									const target = shown![kbdIndex !== null && kbdIndex < n ? kbdIndex : 0];
									if (!target) return;
									e.preventDefault();
									router.push(`/chat/${target.id}`);
									setKbdIndex(null);
									e.currentTarget.blur();
								}
							}}
							placeholder="Search…"
							aria-label="Search sessions"
							onBlur={() => {
								if (!query.trim()) setSearchOpen(false);
							}}
							className="h-9 rounded-lg border-transparent bg-(--pill) pl-9 text-sm placeholder:text-muted-foreground focus-visible:border-primary"
						/>
							<SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						</span>
					</div>
				)}

				<div
					ref={listRef}
					className="flex-1 overflow-y-auto px-2 pb-2"
					// Empty list space is "no folder": dropping a chat there takes it out.
					data-folder-drop=""
					onDragOver={onListDragOver}
					onDragLeave={(e) => {
						if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropFolderId(null);
					}}
					onDrop={onListDrop}
					onDragEnd={endDrag}
				>
					{shown === null ? (
						<div className="px-2 py-4 text-xs text-muted-foreground">Loading…</div>
					) : shown.length === 0 && (query.trim() || folders.length === 0) ? (
						<div className="px-2 py-4 text-xs text-muted-foreground">
							{query.trim() ? "No sessions match." : "No sessions yet."}
						</div>
					) : query.trim() ? (
						// Searching: one flat ranked list, no folders.
						shown.map((c, i) => renderChat(c, i))
					) : (
						<>
							{dragging && (
								<div
									data-testid="new-folder-drop"
									data-folder-drop={NEW_FOLDER_DROP}
									className={cn(
										"mb-1 flex h-9 items-center gap-2 rounded-lg border border-dashed px-3 text-sm text-muted-foreground",
										dropFolderId === NEW_FOLDER_DROP ? "border-primary bg-primary/10 text-foreground" : "border-border",
									)}
								>
									<FolderPlusIcon className="size-4 shrink-0" />
									New folder with this chat
								</div>
							)}
							{folders
								.filter((f) => !f.parentId || !folders.some((p) => p.id === f.parentId))
								.map((f) => renderFolder(f))}
							{shown
								.filter((c) => !c.folderId || !folders.some((f) => f.id === c.folderId))
								.map((c) => renderChat(c, -1))}
						</>
					)}
				</div>

					{/* Background agents (owner, sidebar round): the section is
					    ALWAYS here — empty means empty (the header sits alone); it
					    populates and grows when processes run. The session list is
					    flex-1, so this pins to the bottom. Sidebar closed = the
					    learner opted out (no ambient signal, user decision). */}
					{!pathname.startsWith("/chat/") || pathname === "/chat/new" ? <ActivitySection /> : null}

					{/* Settings entry (settings-app wave): same row language as
					    New session — quiet, bottom-pinned, opens the centered
					    dialog (also mod+, in the keyboard registry). */}
					{/* Bottom row: the app's identity on the left (home), settings
					    on the right — the account-row pattern. */}
					<div className="mx-2 flex items-center gap-1 border-t border-input px-1 pb-3 pt-2">
						<Hint label="Home" action="jump-graph" side="top">
							<Link
								href="/"
								aria-label="Home"
								className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-(--pill)"
							>
								<span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-input bg-card">
									<LhMark className="size-4" />
								</span>
								<span className="truncate font-brand text-[15px] font-semibold text-foreground">Kapany</span>
							</Link>
						</Hint>
						<Hint label="Settings" action="open-settings" side="top">
							<button
								type="button"
								onClick={() => {
									close();
									openSettings();
								}}
								data-testid="settings-entry"
								aria-label="Settings"
								className={CHROME_ICON}
							>
								<SettingsIcon className="size-[18px]" />
							</button>
						</Hint>
					</div>
				</div>

				{/* The context menu (wave 6 + the extraction-UX redesign): the
				    coverage block above, then exactly two management actions
				    (owner ruling — no more). MenuShell owns placement/focus/arrow
				    cycling; the dismissal effect above owns the contract. */}
				{ctxChatId !== null && (
					<MenuShell
						anchorRef={ctxAnchorRef}
						testid="session-context-menu"
						preferredSide="down"
						menuClass="flex w-52 flex-col gap-0.5 rounded-xl border bg-card p-2 text-xs shadow-xl"
					>
						{/* The two management actions first, then the extraction block
						    (owner refinement round, 2026-09-24): Rename/Delete stay at the
						    top, the coverage numbers + Extract affordance sit below the
						    hairline — the block is info + a stateful affordance, the
						    actions above it. Fetched on menu open (the block mounts WITH
						    the menu); 409 = benign. Renders nothing on a failed read. */}
						<button
							type="button"
							data-testid="ctx-rename"
							onClick={() => {
								setRenamingId(ctxChatId);
								setCtxChatId(null);
							}}
							className="flex items-center rounded-lg px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-accent"
						>
							Rename
						</button>
						{/* Move to folder: every folder, a new one, or out of folders. */}
						<div className="my-0.5 border-t border-border/60" aria-hidden="true" />
						<div className="px-2.5 pb-0.5 pt-1 text-[11px] font-medium text-muted-foreground">Move to folder</div>
						{folders.map((f) => (
							<button
								key={f.id}
								type="button"
								data-testid="ctx-move-folder"
								disabled={ctxChat?.folderId === f.id}
								onClick={() => {
									const chatId = ctxChatId;
									setCtxChatId(null);
									void moveToFolder(chatId, f.id);
								}}
								className={cn(MENU_ITEM, "disabled:opacity-50")}
							>
								{f.planChatId ? <FolderTreeIcon className="size-3.5 shrink-0 text-muted-foreground" /> : <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />}
								<span className="min-w-0 flex-1 truncate">{f.name}</span>
								{ctxChat?.folderId === f.id && <CheckIcon className="size-3.5 text-muted-foreground" />}
							</button>
						))}
						<button
							type="button"
							data-testid="ctx-new-folder"
							onClick={() => {
								const chatId = ctxChatId;
								setCtxChatId(null);
								void createFolder(chatId);
							}}
							className={MENU_ITEM}
						>
							<FolderPlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
							New folder
						</button>
						{ctxChat?.folderId && folders.some((f) => f.id === ctxChat.folderId) && (
							<button
								type="button"
								data-testid="ctx-remove-folder"
								onClick={() => {
									const chatId = ctxChatId;
									setCtxChatId(null);
									void moveToFolder(chatId, null);
								}}
								className={MENU_ITEM}
							>
								<XIcon className="size-3.5 shrink-0 text-muted-foreground" />
								Remove from folder
							</button>
						)}
						<div className="my-0.5 border-t border-border/60" aria-hidden="true" />
						{/* Export as Markdown (owner, release polish 2026-10-06): the
					    session-markdown engine's user-facing debut — same-origin
						    anchor download; the route's Content-Disposition names the
						    file. Sits with the management actions, above Delete (the
						    destructive action stays last — the danger-fence law). */}
						<button
							type="button"
							data-testid="ctx-export-md"
							onClick={() => {
								const chatId = ctxChatId;
								setCtxChatId(null);
								const a = document.createElement("a");
								a.href = `/api/chats/${chatId}/markdown`;
								a.download = ""; // the route's filename wins
								document.body.appendChild(a);
								a.click();
								a.remove();
							}}
							className="flex items-center rounded-lg px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-accent"
						>
							Export as Markdown…
						</button>
						<button
							type="button"
							data-testid="ctx-delete"
							onClick={() => {
								const target = chats?.find((c) => c.id === ctxChatId);
								if (target) setDeleting(target);
								setCtxChatId(null);
							}}
							className="flex items-center rounded-lg px-2.5 py-1.5 text-left text-muted-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
						>
							Delete…
						</button>
						<div className="my-0.5 border-t border-border/60" aria-hidden="true" />
						<CoverageMenuBlock chatId={ctxChatId} />
					</MenuShell>
				)}

				{/* The folder menu: new chat / subfolder, rename, material, delete. */}
				{menuFolder && (
					<MenuShell
						anchorRef={folderMenuAnchorRef}
						testid="folder-context-menu"
						preferredSide="down"
						menuClass="flex w-52 flex-col gap-0.5 rounded-xl border bg-card p-2 text-xs shadow-xl"
					>
						<button
							type="button"
							onClick={() => {
								setFolderMenuId(null);
								router.push(`/chat/new?folder=${menuFolder.id}`);
							}}
							className={MENU_ITEM}
						>
							<PlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
							New chat in folder
						</button>
						<button
							type="button"
							data-testid="folder-new-subfolder"
							onClick={() => {
								setFolderMenuId(null);
								void createFolder(undefined, menuFolder.id);
							}}
							className={MENU_ITEM}
						>
							<FolderPlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
							New subfolder
						</button>
						<button
							type="button"
							onClick={() => {
								setFolderMenuId(null);
								setRenamingFolderId(menuFolder.id);
							}}
							className={MENU_ITEM}
						>
							Rename
						</button>
						<button
							type="button"
							data-testid="folder-materials-open"
							onClick={() => {
								setFolderMenuId(null);
								setMaterialsFolderId(menuFolder.id);
							}}
							className={MENU_ITEM}
						>
							{menuFolder.planChatId ? "Course material" : "Folder material"}
						</button>
						<button
							type="button"
							onClick={() => {
								setFolderMenuId(null);
								void deleteFolder(menuFolder.id);
							}}
							className={cn(MENU_ITEM, "text-muted-foreground/80 hover:text-foreground")}
						>
							Delete folder
						</button>
					</MenuShell>
				)}

				{/* A folder's shared material (2026-10-29): every chat in it reads it. */}
				{materialsFolderId && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setMaterialsFolderId(null)}>
						<div
							role="dialog"
							aria-label="Folder material"
							onClick={(e) => e.stopPropagation()}
							className="relative w-full max-w-md rounded-2xl border bg-card p-5 shadow-2xl"
						>
							<button
								type="button"
								aria-label="Close"
								onClick={() => setMaterialsFolderId(null)}
								className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							>
								<XIcon className="size-4" />
							</button>
							<FolderMaterials folderId={materialsFolderId} isCourse={Boolean(folders.find((f) => f.id === materialsFolderId)?.planChatId)} />
						</div>
					</div>
				)}

				{/* The two-option delete dialog (wave 6) — portaled to body
				    by the component itself, lives here for state locality. */}
				<DeleteSessionDialog
					chat={deleting}
					onClose={() => setDeleting(null)}
					onDeleted={onDeleted}
				/>
			</aside>
		</>
	);
}

/** The app frame: sidebar inline + content. Rendered once in the root layout. */
export function AppShell({ children }: { children: React.ReactNode }) {
	return (
		<SettingsDialogProvider>
			<SessionsSidebar />
			<main className="min-w-0 flex-1">{children}</main>
			{/* The single document-level keydown listener (keyboard wave A) —
			    after the content in the tree, but it's window-level so order only
			    matters for the events it dispatches, never for DOM priority. */}
			<KeyboardShortcuts />
			<SearchPalette />
		</SettingsDialogProvider>
	);
}
