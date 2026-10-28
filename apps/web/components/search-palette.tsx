import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { List, ListItem } from "@astryxdesign/core/List";
import { Dialog } from "@astryxdesign/core/Dialog";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Kbd } from "@astryxdesign/core/Kbd";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import {
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

	// Results grouped in render order; `i` stays the flat keyboard index.
	const groups: { name: string; rows: { item: Item; i: number }[] }[] = [];
	items.forEach((item, i) => {
		const last = groups[groups.length - 1];
		if (last && last.name === item.group) last.rows.push({ item, i });
		else groups.push({ name: item.group, rows: [{ item, i }] });
	});

	return (
		<Dialog
			isOpen={open}
			onOpenChange={(next) => {
				if (!next) close();
			}}
			width={704}
			maxHeight="72vh"
			padding={0}
			position={{ top: "14vh" }}
			aria-label="Search"
		>
			{open && (
			<div onKeyDown={onKeyDown} data-testid="search-palette" className="flex max-h-[72vh] flex-col">
				{/* Search box */}
				<div className="flex items-center gap-3 px-5 pt-4 pb-2">
					<TextInput
						ref={inputRef}
						label="Search"
						isLabelHidden
						size="lg"
						width="100%"
						startIcon={SearchIcon}
						value={query}
						onChange={setQuery}
						placeholder="Search sessions, concepts and actions"
						containerClassName="min-w-0 flex-1"
					/>
					<IconButton label="Close search" variant="ghost" size="sm" icon={<XIcon className="size-4" />} onClick={close} />
				</div>

				{/* Type tabs */}
				<div className="border-b border-border px-4 pb-3">
					<SegmentedControl
						label="Result type"
						size="sm"
						value={tab}
						onChange={(next) => {
							setTab(next as Tab);
							inputRef.current?.focus();
						}}
					>
						{TABS.map((t) => (
							<SegmentedControlItem key={t.id} value={t.id} label={t.label} data-testid={`search-tab-${t.id}`} />
						))}
					</SegmentedControl>
				</div>

				{/* Results */}
				<div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2" aria-label="Results">
					{loading && items.length === 0 ? (
						<div className="flex items-center gap-2 px-3 py-6">
							<Spinner size="sm" />
							<Text type="supporting">Loading…</Text>
						</div>
					) : items.length === 0 ? (
						<div className="px-3 py-6">
							<Text type="supporting">
								{query.trim() ? `Nothing matches “${query.trim()}”.` : tab === "concepts" ? "No concepts in your graph yet." : "Nothing here yet."}
							</Text>
						</div>
					) : (
						groups.map((g) => (
							<List key={g.name} density="compact" header={<Text type="label" color="secondary">{g.name}</Text>}>
								{g.rows.map(({ item, i }) => (
									<ListItem
										key={item.key}
										data-index={i}
										isSelected={i === index}
										onMouseMove={() => setIndex(i)}
										onClick={item.run}
										startContent={<span className="text-secondary">{item.icon}</span>}
										label={item.title}
										endContent={item.meta ? <Text type="supporting">{item.meta}</Text> : undefined}
									/>
								))}
							</List>
						))
					)}
				</div>

				{/* Keyboard footer */}
				<div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-5 py-3">
					<FooterKey label="Close" keys={["escape"]} />
					<FooterKey label="Move" keys={["up", "down"]} />
					<FooterKey label="Change type" keys={["tab", "left", "right"]} />
					<span className="ml-auto">
						<FooterKey label="Open" keys={["enter"]} />
					</span>
				</div>
			</div>
			)}
		</Dialog>
	);
}

function FooterKey({ label, keys }: { label: string; keys: string[] }) {
	return (
		<span className="flex items-center gap-1.5">
			<Text type="supporting" size="sm">{label}</Text>
			{keys.map((k) => (
				<Kbd key={k} keys={k} />
			))}
		</span>
	);
}
