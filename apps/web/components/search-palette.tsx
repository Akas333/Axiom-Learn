import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
	CornerDownLeftIcon,
	DumbbellIcon,
	GraduationCapIcon,
	NetworkIcon,
	PlusIcon,
	SearchIcon,
	SettingsIcon,
	SparklesIcon,
	XIcon,
} from "lucide-react";
import { useRouter } from "@/lib/navigation";
import { requestGraphSearch } from "@/lib/graph-search";
import { useSettingsDialog } from "@/components/settings/settings-dialog";
import { cn } from "@/lib/utils";
import type { ChatListItem, GraphSnapshot } from "@/src/core";

/**
 * The search palette (⌘K-style): one dialog to find a session, a concept
 * in the knowledge graph, or an action. Type tabs across the top (All /
 * Sessions / Concepts / Actions), Recents when the box is empty, a
 * keyboard footer at the bottom. Opened by the sidebar's Search row, the
 * sessions-search shortcut, or openSearchPalette() from anywhere.
 *
 * Keys: ↑/↓ move, Tab (or ←/→ on an empty box) changes type, Enter
 * opens, Esc closes.
 */

const OPEN_EVENT = "lh:open-search";

/** Open the palette from anywhere. */
export function openSearchPalette(): void {
	window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

type Tab = "all" | "sessions" | "concepts" | "actions";
const TABS: { id: Tab; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "sessions", label: "Sessions" },
	{ id: "concepts", label: "Concepts" },
	{ id: "actions", label: "Actions" },
];

type Item = {
	key: string;
	group: "Recents" | "Sessions" | "Concepts" | "Actions";
	icon: ReactNode;
	title: string;
	meta?: string;
	run: () => void;
};

const RECENT_COUNT = 8;
const GROUP_LIMIT = 8;

function timeAgo(iso: string): string {
	const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
	if (s < 60) return "just now";
	const m = s / 60;
	if (m < 60) return `${Math.floor(m)}m ago`;
	const h = m / 60;
	if (h < 24) return `${Math.floor(h)}h ago`;
	const d = h / 24;
	if (d < 7) return `${Math.floor(d)}d ago`;
	return new Date(iso).toLocaleDateString();
}

/** Every word of the query appears somewhere in the text (any order). */
function matches(text: string, words: string[]): boolean {
	const t = text.toLowerCase();
	return words.every((w) => t.includes(w));
}

export function SearchPalette() {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [tab, setTab] = useState<Tab>("all");
	const [index, setIndex] = useState(0);
	const [chats, setChats] = useState<ChatListItem[] | null>(null);
	const [concepts, setConcepts] = useState<{ id: string; name: string; statement: string }[] | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const router = useRouter();
	const { open: openSettings } = useSettingsDialog();

	// Open from the sidebar row, the shortcut, or openSearchPalette().
	useEffect(() => {
		const show = () => {
			setQuery("");
			setTab("all");
			setIndex(0);
			setOpen(true);
		};
		window.addEventListener(OPEN_EVENT, show);
		window.addEventListener("lh:kbd-sessions-search", show);
		return () => {
			window.removeEventListener(OPEN_EVENT, show);
			window.removeEventListener("lh:kbd-sessions-search", show);
		};
	}, []);

	// Fresh data on every open (cheap: two local reads).
	useEffect(() => {
		if (!open) return;
		requestAnimationFrame(() => inputRef.current?.focus());
		fetch("/api/chats", { cache: "no-store" })
			.then((r) => r.json() as Promise<{ chats: ChatListItem[] }>)
			.then((d) => setChats(d.chats ?? []))
			.catch(() => setChats([]));
		fetch("/api/graph")
			.then((r) => r.json() as Promise<GraphSnapshot>)
			.then((g) => setConcepts((g.propositions ?? []).map((n) => ({ id: n.id, name: n.name, statement: n.statement }))))
			.catch(() => setConcepts([]));
	}, [open]);

	const close = useCallback(() => setOpen(false), []);
	const go = useCallback(
		(fn: () => void) => () => {
			setOpen(false);
			fn();
		},
		[],
	);

	const items = useMemo<Item[]>(() => {
		const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
		const searching = words.length > 0;

		const sorted = [...(chats ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		const sessionItem = (c: ChatListItem, group: Item["group"]): Item => ({
			key: `s:${c.id}`,
			group,
			icon:
				(c.kind ?? "teach") === "practice" ? (
					<DumbbellIcon className="size-4" />
				) : (
					<GraduationCapIcon className="size-4" />
				),
			title: c.title || "Untitled session",
			meta: c.pendingQuestion ? "Waiting for you" : timeAgo(c.updatedAt),
			run: go(() => router.push(`/chat/${c.id}`)),
		});
		const conceptItem = (n: { id: string; name: string; statement: string }): Item => ({
			key: `c:${n.id}`,
			group: "Concepts",
			icon: <SparklesIcon className="size-4" />,
			title: n.name,
			meta: "Concept",
			run: go(() => {
				requestGraphSearch(n.name);
				router.push("/");
			}),
		});
		const actions: Item[] = [
			{ key: "a:teach", group: "Actions", icon: <PlusIcon className="size-4" />, title: "New teaching", run: go(() => router.push("/chat/new")) },
			{ key: "a:practice", group: "Actions", icon: <DumbbellIcon className="size-4" />, title: "New practice", run: go(() => router.push("/chat/new?mode=practice")) },
			{ key: "a:graph", group: "Actions", icon: <NetworkIcon className="size-4" />, title: "Open knowledge graph", run: go(() => router.push("/")) },
			{ key: "a:settings", group: "Actions", icon: <SettingsIcon className="size-4" />, title: "Settings", run: go(() => openSettings()) },
		];

		const sessions = searching
			? sorted.filter((c) => matches(c.title ?? "", words)).slice(0, GROUP_LIMIT).map((c) => sessionItem(c, "Sessions"))
			: sorted.slice(0, tab === "sessions" ? 50 : RECENT_COUNT).map((c) => sessionItem(c, tab === "sessions" ? "Sessions" : "Recents"));
		const conceptList = searching
			? (concepts ?? []).filter((n) => matches(`${n.name} ${n.statement}`, words)).slice(0, GROUP_LIMIT).map(conceptItem)
			: tab === "concepts"
				? (concepts ?? []).slice(0, 50).map(conceptItem)
				: [];
		const actionList = searching ? actions.filter((a) => matches(a.title, words)) : actions;

		if (tab === "sessions") return sessions;
		if (tab === "concepts") return conceptList;
		if (tab === "actions") return actionList;
		return [...sessions, ...conceptList, ...actionList];
	}, [chats, concepts, query, tab, go, router, openSettings]);

	// Keep the highlight in range and in view.
	useEffect(() => setIndex(0), [query, tab]);
	useEffect(() => {
		listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
	}, [index]);

	if (!open) return null;

	const loading = chats === null || (tab === "concepts" && concepts === null);
	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			close();
		} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			if (items.length === 0) return;
			const d = e.key === "ArrowDown" ? 1 : -1;
			setIndex((i) => (i + d + items.length) % items.length);
		} else if (e.key === "Tab" || ((e.key === "ArrowLeft" || e.key === "ArrowRight") && query === "")) {
			// Change type: Tab / Shift+Tab always; ←/→ while the box is empty
			// (with text typed they move the caret as usual).
			e.preventDefault();
			const back = e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey);
			const i = TABS.findIndex((t) => t.id === tab);
			setTab(TABS[(i + (back ? -1 : 1) + TABS.length) % TABS.length]!.id);
		} else if (e.key === "Enter") {
			e.preventDefault();
			items[index]?.run();
		}
	};

	// Group headers in render order.
	let lastGroup: string | null = null;

	return createPortal(
		<div
			className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[14vh] backdrop-blur-[2px]"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) close();
			}}
			data-testid="search-palette"
		>
			<div
				role="dialog"
				aria-label="Search"
				onKeyDown={onKeyDown}
				className="settings-dialog-pop flex max-h-[72vh] w-full max-w-[44rem] flex-col overflow-hidden rounded-3xl border border-input/70 bg-card shadow-2xl"
			>
				{/* Search box */}
				<div className="flex items-center gap-3 px-5 pt-4 pb-2">
					<SearchIcon className="size-4 shrink-0 text-muted-foreground" />
					<input
						ref={inputRef}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search sessions, concepts and actions"
						aria-label="Search"
						className="lh-input min-w-0 flex-1 bg-transparent py-1 text-lg outline-none placeholder:text-muted-foreground/70"
					/>
					<button
						type="button"
						onClick={close}
						aria-label="Close search"
						className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-(--pill) hover:text-foreground"
					>
						<XIcon className="size-4" />
					</button>
				</div>

				{/* Type tabs */}
				<div role="tablist" aria-label="Result type" className="flex items-center gap-1 border-b border-border/60 px-4 pb-3">
					{TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							role="tab"
							aria-selected={tab === t.id}
							data-testid={`search-tab-${t.id}`}
							onClick={() => {
								setTab(t.id);
								inputRef.current?.focus();
							}}
							className={cn(
								"rounded-lg px-2.5 py-1 text-sm transition-colors",
								tab === t.id ? "bg-(--pill) text-foreground" : "text-muted-foreground hover:text-foreground",
							)}
						>
							{t.label}
						</button>
					))}
				</div>

				{/* Results */}
				<div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2" role="listbox" aria-label="Results">
					{loading && items.length === 0 ? (
						<div className="px-3 py-6 text-sm text-muted-foreground">Loading…</div>
					) : items.length === 0 ? (
						<div className="px-3 py-6 text-sm text-muted-foreground">
							{query.trim() ? `Nothing matches “${query.trim()}”.` : tab === "concepts" ? "No concepts in your graph yet." : "Nothing here yet."}
						</div>
					) : (
						items.map((item, i) => {
							const header = item.group !== lastGroup ? item.group : null;
							lastGroup = item.group;
							const selected = i === index;
							return (
								<div key={item.key}>
									{header && (
										<div className="px-3 pt-3 pb-1.5 text-xs font-medium text-muted-foreground first:pt-1">{header}</div>
									)}
									<button
										type="button"
										role="option"
										aria-selected={selected}
										data-index={i}
										onMouseMove={() => setIndex(i)}
										onClick={item.run}
										className={cn(
											"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
											selected ? "bg-(--pill) text-foreground" : "text-foreground/90",
										)}
									>
										<span className="shrink-0 text-muted-foreground">{item.icon}</span>
										<span className="min-w-0 flex-1 truncate">{item.title}</span>
										{item.meta && <span className="shrink-0 text-xs text-muted-foreground">{item.meta}</span>}
										<CornerDownLeftIcon
											className={cn("size-4 shrink-0 text-muted-foreground", selected ? "opacity-100" : "opacity-0")}
										/>
									</button>
								</div>
							);
						})
					)}
				</div>

				{/* Keyboard footer */}
				<div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
					<FooterKey label="Close" keys={["Esc"]} />
					<FooterKey label="Move" keys={["↑", "↓"]} />
					<FooterKey label="Change type" keys={["Tab", "←", "→"]} />
					<span className="ml-auto">
						<FooterKey label="Open" keys={["↵"]} />
					</span>
				</div>
			</div>
		</div>,
		document.body,
	);
}

function FooterKey({ label, keys }: { label: string; keys: string[] }) {
	return (
		<span className="flex items-center gap-1.5">
			{label}
			{keys.map((k) => (
				<kbd
					key={k}
					className="flex h-5 min-w-5 items-center justify-center rounded-md border border-border px-1 font-sans text-[11px] text-muted-foreground"
				>
					{k}
				</kbd>
			))}
		</span>
	);
}
