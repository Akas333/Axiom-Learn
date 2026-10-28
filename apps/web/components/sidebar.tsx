
import { Button } from "@astryxdesign/core/Button";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/navigation";
import { usePathname, useRouter } from "@/lib/navigation";
import { OnboardingGate } from "@/components/onboarding";
import { useSearchParams } from "react-router";
import { DeleteSessionDialog } from "@/components/delete-session-dialog";
import type { ChatDeleteMode } from "@/src/core";
import { CheckIcon, ChevronDownIcon, FolderIcon, FolderInputIcon, FolderMinusIcon, FolderPlusIcon, MoreHorizontalIcon, ChevronLeftIcon, ChevronRightIcon, DumbbellIcon, NetworkIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon, SearchIcon, SettingsIcon, DownloadIcon, PencilIcon, SparklesIcon, Trash2Icon } from "lucide-react";

/** Sidebar navigation rows (after the Meta Model API console): icon +
 *  label, grey hover, blue-tinted when active. */
/** Square ghost icon button for the chrome rows (top row, bottom row). */
const CHROME_ICON =
	"lh-no-drag flex size-8 shrink-0 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-overlay-hover hover:text-primary";
const NAV_ROW =
	"flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] text-primary transition-colors hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-accent-bg";
const NAV_ROW_ACTIVE = "bg-overlay-hover hover:bg-overlay-hover";
import { ActivitySection } from "@/components/activity-dock";
import { useSessionCoverage } from "@/components/extraction-coverage";
import { LhMark } from "@/components/lh-mark";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { SettingsDialogProvider, useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { hintText, TOOLTIP_DELAY_MS } from "@/lib/shortcut-hint";
import { IconButton } from "@astryxdesign/core/IconButton";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { ContextMenu } from "@astryxdesign/core/ContextMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { SideNav, SideNavItem } from "@astryxdesign/core/SideNav";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { cn } from "@/lib/utils";
import { fuzzyScore } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { openSearchPalette, SearchPalette } from "@/components/search-palette";
import type { ChatFolder, ChatListItem } from "@/src/core";
import { kbdEventForAction } from "@/src/core";
import { notifySettingsSaved } from "@/components/settings-signal";

/**
 * Toggleable sidebar — NOT a modal drawer: no backdrop, no focus theft. It
 * sits inline next to the content and can stay open while working in a
 * session. Open state persists across pages (provider lives in the root
 * layout) and across reloads (localStorage).
 */

const STORAGE_KEY = "lh:sidebar-open";

/*
 * Narrow-window behavior (owner, 2026-09-17): below SIDEBAR_AUTOCLOSE the
 * sidebar would squeeze the page below the 640px window floor (the two
 * numbers compose: 640 + 288 sidebar = 928), so it auto-closes — and
 * auto-RESTORES when the window widens again (owner choice: the sidebar
 * pops back, not a manual re-open). The whole behavior is one expression:
 * rendered = pref && !narrow, where pref is the persisted user choice.
 * Manual closes persist and stay closed; auto-close does not touch the
 * preference. Opening the sidebar while narrow asks the Electron shell to
 * widen the window to the threshold (window.lh.expandWindow, IPC in
 * electron/main.cjs) — the resize listener flips `narrow` and the sidebar
 * appears. In the plain browser there is no window to widen and no
 * suppression — a narrow tab opens the sidebar if the user says so.
 *
 * Mirrors SIDEBAR_AUTOCLOSE in electron/main.cjs — keep in sync.
 */
import type { ChatGPTControlBridge, NativeSubscriptionControlBridge } from "@/src/core";
import type { UpdateState } from "@/components/settings/update-settings.tsx";
const SIDEBAR_AUTOCLOSE = 928;

// Module scope, guarded for SSR (the server has no navigator).
const IS_ELECTRON = typeof navigator !== "undefined" && navigator.userAgent.includes("Electron");

declare global {
	interface Window {
		/** Preload bridge (electron/preload.cjs) — Electron only, absent in the browser. */
		lh?: {
			/** Read-only host OS; determines the native-control gutter. */
			platform?: string;
			/** External Next desktop-dev uses the server's web connections. */
			subscriptionTransport?: "desktop" | "web";
			openSubscriptionBrowser?: (action: string) => Promise<void>;
			chatgpt?: ChatGPTControlBridge;
			subscriptions?: NativeSubscriptionControlBridge;
			expandWindow: () => void;
			/** The zoom truth (owner round 7): subscribes to "lh:zoom" pushes; returns unsubscribe. */
			onZoom?: (cb: (factor: number) => void) => () => void;
			getZoom?: () => Promise<number>;
			/** Observational update events and a snapshot for late subscribers. */
			onUpdateStatus?: (cb: (status: UpdateState) => void) => () => void;
			getUpdateState?: () => Promise<UpdateState>;
			/** Explicit manual check also downloads and stages available updates. */
			checkForUpdates?: () => Promise<void>;
			installUpdate?: () => void;
			onOpenSettings?: (cb: (section: string) => void) => () => void;
		};
	}
}

/** Phone-width browser windows: the sidebar becomes a slide-over drawer
 *  (backdrop, closes after navigating) instead of an inline column that
 *  would leave no room for the page. Electron keeps its own narrow logic. */
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
	useEffect(() => {
		const bridge = window.lh?.chatgpt;
		if (!bridge) return;
		const off = bridge.onChange(() => notifySettingsSaved("keys"));
		notifySettingsSaved("keys"); // cover changes missed before this root-lifetime subscription
		return off;
	}, []);
	// Start closed so server and client first-render agree (no hydration
	// mismatch); the stored value is applied after mount.
	const [open, setOpen] = useState(false);
	const [narrow, setNarrow] = useState(false);
	const [mounted, setMounted] = useState(false);
	// Drawer state on phones — separate from the persisted desktop
	// preference, always starts closed.
	const [mobile, setMobile] = useState(
		() => !IS_ELECTRON && typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches,
	);
	const [drawerOpen, setDrawerOpen] = useState(false);

	useEffect(() => {
		if (IS_ELECTRON) return;
		const mq = window.matchMedia(MOBILE_QUERY);
		const onChange = () => {
			setMobile(mq.matches);
			setDrawerOpen(false);
		};
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	useEffect(() => {
		// Electron shell detection (merged chrome, 2026-09-17): keys the
		// .lh-electron CSS (app/globals.css) that turns the header bands
		// into the window's drag surface. Post-mount only — server HTML
		// and first client render must agree (no hydration mismatch),
		// and in the plain browser the class never appears.
		if (IS_ELECTRON) {
			document.documentElement.classList.add("lh-electron");
			document.documentElement.dataset.lhPlatform = window.lh?.platform ?? "";
		}

		// THE ZOOM TRUTH (owner round 7, 2026-10-05): ⌘±/⌘0 zoom the UI
		// (Electron zoomFactor) while the native traffic lights stay
		// physical-fixed — the CSS gutter lengths divide by this factor so
		// their RENDERED size never moves. getZoom covers the first-paint
		// race; every later change arrives as an lh:zoom push.
		const setZoomVar = (factor: number) =>
			document.documentElement.style.setProperty("--lh-zoom", String(factor));
		const off = window.lh?.onZoom?.(setZoomVar);
		void window.lh?.getZoom?.().then(setZoomVar);

		const stored = localStorage.getItem(STORAGE_KEY);
		// Default: open (first run introduces the sidebar).
		setOpen(stored === null ? true : stored === "1");
		setMounted(true);
		return () => off?.();
	}, []);

	// Narrow-window auto-close/auto-restore (see SIDEBAR_AUTOCLOSE note):
	// fires only on actual resizes — a boolean compare, no layout work.
	// Both this and the mount effect land before the first paint, so a
	// narrow window never flashes the open sidebar on load.
	useEffect(() => {
		if (!IS_ELECTRON) return; // plain-browser tabs open freely
		const onResize = () => setNarrow(window.innerWidth < SIDEBAR_AUTOCLOSE);
		onResize();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	const toggle = useCallback(() => {
		if (mobile) {
			setDrawerOpen((v) => !v);
			return;
		}
		// Opening while narrow (auto-closed, or the user's own closed-at-
		// narrow): ask the shell to widen to the threshold — the resize
		// listener flips `narrow` and the sidebar appears. The preference
		// persists like any other open, so a restart at a narrow width
		// still auto-restores when widened.
		if (narrow && !open) {
			localStorage.setItem(STORAGE_KEY, "0");
			setOpen(true);
			window.lh?.expandWindow();
			return;
		}
		setOpen((v) => {
			localStorage.setItem(STORAGE_KEY, v ? "0" : "1");
			return !v;
		});
	}, [narrow, open, mobile]);

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
		<SidebarContext.Provider value={{ open: mobile ? drawerOpen : open && !narrow, toggle, mobile, close }}>
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
				"sidebar-motion lh-no-drag relative flex h-9 shrink-0 overflow-hidden duration-200",
				open ? "w-0 -mr-3" : "w-9 mr-0 lh-closed-toggle",
			)}
		>
			<Tooltip content={hintText("Open sidebar", "toggle-sidebar", undefined)} placement="above" delay={TOOLTIP_DELAY_MS} hasHoverIndication={false}>
			<IconButton variant="ghost" size="md" label="Open sidebar" icon={<PanelLeftOpenIcon className="size-4" />} className={cn("sidebar-motion duration-200", open ? "pointer-events-none opacity-0" : "opacity-100")} aria-hidden={open} tabIndex={open ? -1 : 0} onClick={toggle} />
			</Tooltip>
		</span>
	);
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
 * One session row (Astryx SideNavItem): the title, then the state on the
 * right — a spinner while working, a dot while it waits on the learner,
 * a dumbbell for practice. The state + age ride the tooltip.
 */
export function SessionRow({
	chat,
	active,
	onOpen,
	kbdSelected = false,
	onDragStart,
}: {
	chat: ChatListItem;
	active: boolean;
	onOpen: () => void;
	/** Set to make the row draggable (the sidebar's drag-to-folder). */
	onDragStart?: (e: React.DragEvent<HTMLElement>) => void;
	/** Keyboard-walk highlight from the sidebar search (↑/↓). */
	kbdSelected?: boolean;
}) {
	const waiting =
		!(chat.busy || chat.compacting) &&
		(chat.pendingQuestion || ((chat.kind ?? "teach") === "practice" && chat.pendingProblem));
	return (
		<Tooltip content={sessionMeta(chat)} placement="end" delay={TOOLTIP_DELAY_MS} hasHoverIndication={false}>
			<SideNavItem
				label={chat.title}
				isSelected={active || kbdSelected}
				onClick={onOpen}
				data-testid={kbdSelected ? "session-row-kbd" : "session-row"}
				{...(onDragStart
					? {
							draggable: true,
							onDragStart,
							// Dropping on this chat files the dragged one beside it.
							"data-folder-drop": chat.folderId ?? "",
						}
					: {})}
				endContent={
					chat.busy || chat.compacting ? (
						<Spinner size="sm" label="Working" />
					) : waiting ? (
						<StatusDot variant="neutral" label="Waiting for you" />
					) : (chat.kind ?? "teach") === "practice" ? (
						<Icon icon={DumbbellIcon} size="sm" color="secondary" />
					) : undefined
				}
			/>
		</Tooltip>
	);
}

/** The inline-rename row: an Astryx TextInput with the title selected;
 *  Enter/blur commits, Esc discards. */
export function RenameRow({
	chat,
	label = "Rename session",
	onCommit,
	onCancel,
}: {
	chat: { title: string };
	label?: string;
	onCommit: (next: string) => void;
	onCancel: () => void;
}) {
	const [draft, setDraft] = useState(chat.title);
	const inputRef = useRef<HTMLInputElement | null>(null);
	useEffect(() => {
		inputRef.current?.select();
	}, []);
	return (
		<TextInput
			ref={inputRef}
			label={label}
			isLabelHidden
			size="sm"
			width="100%"
			hasAutoFocus
			value={draft}
			data-testid="session-rename-input"
			onChange={setDraft}
			onBlur={() => onCommit(draft)}
			onKeyDown={(e) => {
				if (e.key === "Enter") e.currentTarget.blur();
				if (e.key === "Escape") {
					e.stopPropagation(); // discard, not also the sidebar/chat chains
					onCancel();
				}
			}}
		/>
	);
}

/** The three-way kind filter (practice sessions, owner 2026-10-04):
 *  Teaching / All / Practice — a client-side filter over the same
 *  snapshot, persisted in localStorage, defaulting to All. */
export type SessionKindFilter = "teach" | "all" | "practice";
const KIND_FILTER_KEY = "lh:session-kind-filter";
/** Folder ids the user collapsed in the sidebar (per browser). */
const COLLAPSED_FOLDERS_KEY = "lh:collapsed-folders";

function SessionsSidebar() {
	const { open, toggle, mobile, close } = useSidebar();
	const [chats, setChats] = useState<ChatListItem[] | null>(null);
	const [folders, setFolders] = useState<ChatFolder[]>([]);
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
				// storage unavailable: the state still holds for this visit
			}
			return next;
		});
	}, []);
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
			const [chatsRes, foldersRes] = await Promise.all([
				fetch("/api/chats", { cache: "no-store" }),
				fetch("/api/folders", { cache: "no-store" }),
			]);
			const d = (await chatsRes.json()) as { chats: ChatListItem[] };
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
	const coverage = useSessionCoverage(ctxChatId);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<ChatListItem | null>(null);

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

	/* ── Folders: group sessions in the sidebar. A new folder opens straight
	   into rename; a chat moves through its right-click "Move to folder". */
	const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
	const [folderMenuId, setFolderMenuId] = useState<string | null>(null);

	/* Drag a chat onto a folder to save it there; drop it on a chat outside
	   folders, or on empty list space, to take it out. Drop targets carry
	   data-folder-drop (the folder id, "" = no folder). */
	const draggingIdRef = useRef<string | null>(null);
	const [dropFolderId, setDropFolderId] = useState<string | null>(null);
	const dropTargetOf = (e: React.DragEvent): string => {
		const el = (e.target as HTMLElement).closest<HTMLElement>("[data-folder-drop]");
		return el?.dataset.folderDrop ?? "";
	};
	const onListDragOver = (e: React.DragEvent) => {
		if (!draggingIdRef.current) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		const target = dropTargetOf(e);
		setDropFolderId((prev) => (prev === target ? prev : target));
	};
	const endDrag = () => {
		draggingIdRef.current = null;
		setDropFolderId(null);
	};
	const onListDrop = (e: React.DragEvent) => {
		const chatId = draggingIdRef.current;
		endDrag();
		if (!chatId) return;
		e.preventDefault();
		const target = dropTargetOf(e) || null;
		const chat = chatsRef.current?.find((c) => c.id === chatId);
		if (chat && (chat.folderId ?? null) !== target) void moveToFolder(chatId, target);
	};

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

	const createFolder = useCallback(async (moveChatId?: string) => {
		try {
			const res = await fetch("/api/folders", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "New folder" }),
			});
			if (!res.ok) throw new Error(`create folder failed: ${res.status}`);
			const { folder } = (await res.json()) as { folder: ChatFolder };
			setFolders((prev) => [...prev, folder]);
			setFolderCollapsed(folder.id, false);
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
		// The sessions stay; they just leave the folder.
		setFolders((prev) => prev.filter((f) => f.id !== id));
		setChats((prev) => (prev ? prev.map((c) => (c.folderId === id ? { ...c, folderId: undefined } : c)) : prev));
		try {
			const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
			if (!res.ok) throw new Error(`delete folder failed: ${res.status}`);
		} catch (err) {
			console.error("delete folder failed:", err);
			void refreshRef.current();
		}
	}, []);

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

	/** One session row with its right-click menu (or the inline rename).
	 *  `i` is the row's index in the flat search list; -1 when grouped. */
	const renderChat = (c: ChatListItem, i: number) =>
		renamingId === c.id ? (
			<RenameRow
				key={c.id}
				chat={c}
				onCommit={(next) => void commitRename(c.id, next)}
				onCancel={() => setRenamingId(null)}
			/>
		) : (
			<ContextMenu
				key={c.id}
				label={`${c.title} actions`}
				menuWidth={240}
				onOpenChange={(open) => setCtxChatId(open ? c.id : null)}
				items={[
					{ label: "Rename", icon: PencilIcon, onClick: () => setRenamingId(c.id) },
					{
						label: "Move to folder",
						icon: FolderInputIcon,
						items: [
							...folders.map((f) => ({
								id: f.id,
								label: f.name,
								icon: FolderIcon,
								isDisabled: c.folderId === f.id,
								endContent: c.folderId === f.id ? <CheckIcon className="size-3.5" /> : undefined,
								onClick: () => void moveToFolder(c.id, f.id),
							})),
							...(folders.length > 0 ? [{ type: "divider" as const }] : []),
							{ id: "new-folder", label: "New folder", icon: FolderPlusIcon, onClick: () => void createFolder(c.id) },
						],
					},
					...(c.folderId && folders.some((f) => f.id === c.folderId)
						? [{ label: "Remove from folder", icon: FolderMinusIcon, onClick: () => void moveToFolder(c.id, null) }]
						: []),
					{
						label: "Export as Markdown",
						icon: DownloadIcon,
						onClick: () => {
							const a = document.createElement("a");
							a.href = `/api/chats/${c.id}/markdown`;
							a.download = ""; // the route's filename wins
							a.click();
						},
					},
					{ label: "Delete…", icon: Trash2Icon, variant: "destructive", onClick: () => setDeleting(c) },
					...(ctxChatId === c.id && coverage.summary
						? [
								{ type: "divider" as const },
								{
									label: coverage.busy ? "Extracting…" : "Extract now",
									description: coverage.summary,
									icon: SparklesIcon,
									isDisabled: coverage.busy || coverage.complete,
									onClick: () => void coverage.extract(),
								},
							]
						: []),
				]}
			>
				<SessionRow
					chat={c}
					active={pathname === `/chat/${c.id}`}
					kbdSelected={i === kbdIndex}
					onDragStart={(e) => {
						draggingIdRef.current = c.id;
						e.dataTransfer.effectAllowed = "move";
						e.dataTransfer.setData("text/plain", c.title);
					}}
					onOpen={() => {
						setKbdIndex(null);
						router.push(`/chat/${c.id}`);
					}}
				/>
			</ContextMenu>
		);

	useEffect(() => {
		if (!open) return;
		void refresh();
		// Opening + navigation refetch; while open, the events channel owns
		// freshness (S6) — no interval, nothing standing.
	}, [open, pathname, refresh]);

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
			<SideNav
				aria-label="Sessions"
				className={cn(
					"h-full border-r border-border bg-body",
					mobile ? "w-full pt-(--safe-top) pb-(--safe-bottom) pl-(--safe-left)" : "w-72",
				)}
				header={
					/* Window chrome: close, back, forward. In Electron this band is
					   the drag surface and starts after the traffic lights. */
					<div className="lh-drag lh-lights-gutter flex h-15 shrink-0 items-center gap-0.5 px-1">
						<Tooltip content={hintText("Close sidebar", "toggle-sidebar", undefined)} placement="above" delay={TOOLTIP_DELAY_MS} hasHoverIndication={false}>
							<IconButton label="Close sidebar" variant="ghost" size="sm" className="lh-no-drag" icon={<PanelLeftCloseIcon className="size-4" />} onClick={toggle} />
						</Tooltip>
						<Tooltip content="Back" placement="below" delay={TOOLTIP_DELAY_MS} hasHoverIndication={false}>
							<IconButton label="Back" variant="ghost" size="sm" className="lh-no-drag" icon={<ChevronLeftIcon className="size-4" />} onClick={() => window.history.back()} />
						</Tooltip>
						<Tooltip content="Forward" placement="below" delay={TOOLTIP_DELAY_MS} hasHoverIndication={false}>
							<IconButton label="Forward" variant="ghost" size="sm" className="lh-no-drag" icon={<ChevronRightIcon className="size-4" />} onClick={() => window.history.forward()} />
						</Tooltip>
					</div>
				}
				topContent={
					<nav className="flex flex-col gap-0.5" aria-label="Main">
						<SideNavItem
							data-testid="new-session"
							label="New session"
							icon={PlusIcon}
							isSelected={pathname === "/chat/new" && !searchParams.get("folder")}
							onClick={() => void newSession()}
						/>
						<Tooltip content={hintText("Search", "sessions-search", undefined)} placement="end" delay={TOOLTIP_DELAY_MS} hasHoverIndication={false}>
							<SideNavItem data-testid="nav-search" label="Search" icon={SearchIcon} onClick={openSearchPalette} />
						</Tooltip>
						<SideNavItem
							data-testid="nav-graph"
							label="Knowledge graph"
							icon={NetworkIcon}
							isSelected={pathname === "/"}
							onClick={() => router.push("/")}
						/>
					</nav>
				}
				footer={
					<>
						{/* Background agents: always here; grows while processes run. */}
						{!pathname.startsWith("/chat/") || pathname === "/chat/new" ? <ActivitySection /> : null}
						{/* Bottom row: identity (home) left, settings right. */}
						<div className="flex items-center gap-1 border-t border-border pt-2">
							<Tooltip content={hintText("Home", "jump-graph", undefined)} placement="above" delay={TOOLTIP_DELAY_MS} hasHoverIndication={false}>
								<Link
									href="/"
									aria-label="Home"
									className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-overlay-hover"
								>
									<span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-strong bg-card">
										<LhMark className="size-4" />
									</span>
									<span className="truncate font-brand text-[15px] font-semibold text-primary">Kapany</span>
								</Link>
							</Tooltip>
							<Tooltip content={hintText("Settings", "open-settings", undefined)} placement="above" delay={TOOLTIP_DELAY_MS} hasHoverIndication={false}>
								<IconButton
									label="Settings"
									data-testid="settings-entry"
									variant="ghost"
									icon={<SettingsIcon className="size-4" />}
									onClick={() => {
										close();
										openSettings();
									}}
								/>
							</Tooltip>
						</div>
					</>
				}
			>
				{/* Section heading — the list's scope, as a quiet dropdown
				    ("All sessions ▾"), the project-heading pattern. */}
				<div className="relative mt-3 mb-1 flex items-center px-3" data-testid="session-kind-filter">
					<DropdownMenu
						isMenuOpen={filterMenu}
						onOpenChange={setFilterMenu}
						menuWidth={176}
						renderTrigger={(trigger) => (
							<Button
								{...trigger}
								data-testid="kind-filter-menu"
								variant="ghost"
								size="sm"
								label={kindFilter === "teach" ? "Teaching sessions" : kindFilter === "practice" ? "Practice sessions" : "All sessions"}
								endContent={<Icon icon={ChevronDownIcon} />}
							/>
						)}
						items={(["all", "teach", "practice"] as const).map((f) => ({
							id: f,
							label: f === "teach" ? "Teaching" : f === "all" ? "All" : "Practice",
							endContent: kindFilter === f ? <CheckIcon className="size-3.5" /> : undefined,
							onClick: () => setFilter(f),
						}))}
					/>
					<Tooltip content="New folder" placement="above" delay={TOOLTIP_DELAY_MS} hasHoverIndication={false}>
						<IconButton
							label="New folder"
							data-testid="new-folder"
							variant="ghost"
							size="sm"
							className="ml-auto"
							icon={<FolderPlusIcon className="size-4" />}
							onClick={() => void createFolder()}
						/>
					</Tooltip>
				</div>

				{(searchOpen || query) && (
					<div className="mb-1">
						<TextInput
							ref={searchRef}
							label="Search sessions"
							isLabelHidden
							size="md"
							startIcon={SearchIcon}
							data-testid="session-search"
							value={query}
							onChange={(next) => {
								setQuery(next);
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
							onBlur={() => {
								if (!query.trim()) setSearchOpen(false);
							}}
						/>
					</div>
				)}

				<div
					ref={listRef}
					className="min-h-24 pb-2 [&_[role=group]]:grid-cols-1 [&_[role=group]>div]:min-w-0"
					onDragOver={onListDragOver}
					onDragLeave={(e) => {
						if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropFolderId(null);
					}}
					onDrop={onListDrop}
					onDragEnd={endDrag}
				>
					{shown === null ? (
						<div className="flex items-center gap-2 px-3 py-4"><Spinner size="sm" /><Text type="supporting">Loading…</Text></div>
					) : shown.length === 0 && (query.trim() || folders.length === 0) ? (
						<div className="px-3 py-4">
							<Text type="supporting">{query.trim() ? "No sessions match." : "No sessions yet."}</Text>
						</div>
					) : query.trim() ? (
						// Searching: one flat ranked list, no folders.
						shown.map((c, i) => renderChat(c, i))
					) : (
						<>
							{folders.map((folder) => {
								const inside = shown.filter((c) => c.folderId === folder.id);
								if (renamingFolderId === folder.id) {
									return (
										<RenameRow
											key={folder.id}
											chat={{ title: folder.name }}
											label="Rename folder"
											onCommit={(next) => void commitFolderRename(folder.id, next)}
											onCancel={() => setRenamingFolderId(null)}
										/>
									);
								}
								return (
									<SideNavItem
										key={folder.id}
										data-testid="folder-row"
										data-folder-drop={folder.id}
										label={folder.name}
										icon={FolderIcon}
										isSelected={dropFolderId === folder.id || (pathname === "/chat/new" && searchParams.get("folder") === folder.id)}
										collapsible={{
											isCollapsed: collapsedFolders.has(folder.id),
											onCollapsedChange: (c) => setFolderCollapsed(folder.id, c),
										}}
										onClick={() => setFolderCollapsed(folder.id, !collapsedFolders.has(folder.id))}
										actions={
											<>
											<Tooltip content="New chat in folder" placement="above" delay={TOOLTIP_DELAY_MS} hasHoverIndication={false}>
												<IconButton
													label={`New chat in ${folder.name}`}
													data-testid="folder-new-chat"
													variant="ghost"
													icon={<PlusIcon className="size-4" />}
													onClick={() => router.push(`/chat/new?folder=${folder.id}`)}
												/>
											</Tooltip>
											<DropdownMenu
												isMenuOpen={folderMenuId === folder.id}
												onOpenChange={(o) => setFolderMenuId(o ? folder.id : null)}
												menuWidth={180}
												renderTrigger={(trigger) => (
													<IconButton
														{...trigger}
														label={`${folder.name} actions`}
														variant="ghost"
														icon={<MoreHorizontalIcon className="size-4" />}
													/>
												)}
												items={[
													{ id: "new-chat", label: "New chat in folder", icon: PlusIcon, onClick: () => router.push(`/chat/new?folder=${folder.id}`) },
													{ id: "rename", label: "Rename", icon: PencilIcon, onClick: () => setRenamingFolderId(folder.id) },
													{ id: "delete", label: "Delete folder", icon: Trash2Icon, variant: "destructive", onClick: () => void deleteFolder(folder.id) },
												]}
											/>
											</>
										}
									>
										{inside.length === 0 ? (
											<SideNavItem label="Empty — drag a chat here" isDisabled data-folder-drop={folder.id} />
										) : (
											inside.map((c) => renderChat(c, -1))
										)}
									</SideNavItem>
								);
							})}
							{shown
								.filter((c) => !c.folderId || !folders.some((f) => f.id === c.folderId))
								.map((c) => renderChat(c, -1))}
						</>
					)}
				</div>

			</SideNav>

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
			<OnboardingGate />
		</SettingsDialogProvider>
	);
}
