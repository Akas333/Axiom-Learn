/**
 * THE SETTINGS DIALOG (settings-app wave, 2026-09-20): the thin settings
 * page graduated into the designed surface — a centered modal over
 * everything, left section nav + one scrolling content column.
 *
 * Owner decisions this wave:
 * - Dialog, not a page: opens over whatever screen you're on (the payoff:
 *   appearance edits restyle the chat LIVE behind the dialog). Escape,
 *   backdrop, and ✕ all close. Modal-only — /settings redirects, so
 *   nothing links into a dead surface.
 * - Left section nav in the app's mono chrome (text-only, session-list
 *   language — active = bg-overlay-hover), no icons, matching the minimal-color
 *   doctrine.
 * - The dialog is surface-agnostic by construction: the sections talk to
 *   /api/settings* and localStorage only, so this shell can be re-mounted
 *   as a true OS window in the Electron round with near-zero churn.
 *
 * The record + the single `write` seam moved here from the thin page:
 * one record instance for the whole dialog, sections write through it,
 * switching sections never refetches.
 */

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
	CURRENT_SETTINGS_VERSION,
	type AgentSettings,
	type AppearanceSettings,
	type CompactionSettings,
	type GraphSettings,
	type UserSettings,
} from "@/src/core";
import { useAppearance } from "./appearance.tsx";
import { SettingsSection } from "./controls.tsx";
import { UpdateSettings } from "./update-settings.tsx";
import { VoiceSettings } from "./voice-settings.tsx";
import { AgentSection } from "./agent-section.tsx";
import type { ModelsSettings } from "@/src/core";
import { notifySettingsSaved } from "@/components/settings-signal";
import { KeysSection } from "./keys-section.tsx";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { hintText, TOOLTIP_DELAY_MS } from "@/lib/shortcut-hint";
import { AppearanceSection, GraphSection } from "./appearance-section.tsx";
import { KeyboardSection } from "./keyboard-section.tsx";
import { LearnerSection } from "./learner-section.tsx";
import { AnkiSection } from "./anki-section.tsx";
import { ChatGPTUIProvider } from "./chatgpt-connection.tsx";
import { NativeSubscriptionUIProvider } from "./subscription-connections.tsx";
import { SettingsSkinContext } from "./controls.tsx";
import { BotIcon, LayersIcon, GraduationCapIcon, KeyboardIcon, KeyRoundIcon, NetworkIcon, PaletteIcon, SearchIcon, SettingsIcon, XIcon } from "lucide-react";

/** Owner (2026-09-20): hints earn their place — mechanics-explaining
 *  prose is out; only the keyboard note stays (storage location is a
 *  real question users ask). */
const SECTIONS = [
	{ id: "general", label: "General", group: "Preferences", Icon: SettingsIcon, keywords: "updates automatic voice hands-free dictation" },
	{ id: "appearance", label: "Appearance", group: "Preferences", Icon: PaletteIcon, keywords: "theme mode dark light background font reading size bold italic heading serif colors" },
	{ id: "keyboard", label: "Keyboard", hint: "Stored on this device", group: "Preferences", Icon: KeyboardIcon, keywords: "shortcuts keys bindings hotkeys" },
	{ id: "learner", label: "About you", group: "Learning", Icon: GraduationCapIcon, keywords: "learner profile level grade school math style intuitive formal notes onboarding intro context" },
	{ id: "agent", label: "Agent", group: "Learning", Icon: BotIcon, keywords: "models tools prompts instructions quizzing quiz compaction context search engine" },
	{ id: "graph", label: "Graph", group: "Learning", Icon: NetworkIcon, keywords: "knowledge graph rendering extraction chunk" },
	{ id: "anki", label: "Anki", group: "Connections", Icon: LayersIcon, keywords: "anki flashcards deck spaced repetition ankiconnect sync review cards" },
	{ id: "keys", label: "Providers", group: "Connections", Icon: KeyRoundIcon, keywords: "api keys model provider local ollama meta subscriptions chatgpt dictation tavily brave" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];
const SECTION_GROUPS = ["Preferences", "Learning", "Connections"] as const;

/** `open(section?, row?)` — the optional ROW deep-links into the Keys
 *  section with that row unfolded (zero-keys wave: the dictation error's
 *  click lands on the Deepgram row). `row` is the KEY ID (the env-var
 *  name, e.g. DEEPGRAM_API_KEY — KeysSection's openRow state), not the
 *  row's testid. */
const DialogContext = createContext<{ open: (section?: string, row?: string) => void }>({ open: () => {} });

/** AppShell-level mount: the sidebar row and the mod+, chord call this.
 *  `open(section)` lands the dialog on a specific section (the first-run
 *  setup flow deep-links to Keys when no provider key exists yet). */
export function SettingsDialogProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [show, setShow] = useState(false);
	const [landOn, setLandOn] = useState<SectionId>("keys");
	const [landOnRow, setLandOnRow] = useState<string | null>(null);
	const open = useCallback((section?: string, row?: string) => {
		setLandOn(section ? section as SectionId : "keys");
		setLandOnRow(row ?? null);
		setShow(true);
	}, []);
	useEffect(() => window.lh?.onOpenSettings?.((section) => open(section)), [open]);
	return (
		<ChatGPTUIProvider><NativeSubscriptionUIProvider><DialogContext.Provider value={{ open }}>
			{children}
			<SettingsDialog
				isOpen={show}
				onClose={() => setShow(false)}
				initialSection={landOn}
				initialRow={landOnRow}
			/>
		</DialogContext.Provider></NativeSubscriptionUIProvider></ChatGPTUIProvider>
	);
}

export function useSettingsDialog() {
	return useContext(DialogContext);
}

function SettingsDialog({
	isOpen,
	onClose,
	initialSection,
	initialRow,
}: {
	isOpen: boolean;
	onClose: () => void;
	initialSection: SectionId;
	/** The keys-section row to unfold (see DialogContext above). */
	initialRow: string | null;
}) {
	return (
		<Dialog
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			purpose="form"
			width={1040}
			maxHeight="min(780px, calc(100dvh - 2rem))"
			padding={0}
		>
			{isOpen && <SettingsDialogBody onClose={onClose} initialSection={initialSection} initialRow={initialRow} />}
		</Dialog>
	);
}

/** The dialog without the portal/backdrop — the SSR-testable frame
 *  (portals render nothing under renderToStaticMarkup). */
export function SettingsDialogBody({
	onClose,
	initialSection = "keys",
	initialRow = null,
}: {
	onClose: () => void;
	initialSection?: SectionId;
	/** The keys row to unfold on arrival (null = none). While-open
	 *  retargets follow it exactly like initialSection below. */
	initialRow?: string | null;
}) {
	const { onAppearanceChange } = useAppearance();
	const [record, setRecord] = useState<UserSettings | null | undefined>(
		undefined,
	);
	const [error, setError] = useState<string | null>(null);
	const contentRef = useRef<HTMLDivElement | null>(null);
	// Scroll-lock (fix wave, owner ruling: the scrollbar MAY stay,
	// scrolling must NOT happen, nothing may move): the content column
	// keeps overflow-y-auto — the scrollbar and every width stay exactly
	// as they are — and while any MenuShell is open, non-passive wheel +
	// touchmove listeners on the column preventDefault. React attaches
	// synthetic wheel/touch passively at the root, so this needs the
	// native-listener ref seam.
	const [active, setActive] = useState<SectionId>(initialSection);
	const [search, setSearch] = useState("");
	const narrow = useMediaQuery("(max-width: 640px)");
	const q = search.trim().toLowerCase();
	const matches = q
		? SECTIONS.filter((s) => `${s.label} ${s.keywords}`.toLowerCase().includes(q))
		: SECTIONS;
	// A deep-link fired while the dialog is ALREADY open (first exercised by
	// the wave-6 embedding picker's "Add a provider key first…" link — the
	// picker itself died with wave 7, the mechanism is general) changes
	// initialSection under our feet — follow it, or the link silently does
	// nothing.
	useEffect(() => {
		setActive(initialSection);
	}, [initialSection]);

	// Fetch once per dialog mount. 200 {settings: null} is FIRST BOOT
	// (no record = factory everything), not a failure — the error state is
	// a non-200 or a network throw only.
	useEffect(() => {
		fetch("/api/settings")
			.then((r) =>
				r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`)),
			)
			.then((body: { settings: UserSettings | null }) =>
				setRecord(body.settings ?? { version: CURRENT_SETTINGS_VERSION }),
			)
			.catch(() => setRecord(null));
	}, []);

	// Escape closes — the layered-dismiss convention (Esc is dead for the
	// sections' own editors while they hold focus; this listener is the
	// dialog's outer layer).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				// THE ONE-ESC LAW (owner, keyboard round 2026-10-06): claim
				// at the document level — the window chain (dictation →
				// abort) must not also act. One Esc, one action.
				e.preventDefault();
				e.stopPropagation();
				// A stacked dialog (a connection flow) owns this Esc.
				if (document.querySelectorAll("dialog[open]").length > 1) return;
				onClose();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	/** ONE writer for the whole dialog: PUT the whole section, keep the
	 *  record mirror in sync, surface route errors inline (a 400 is a
	 *  schema mistake caught by the validation surface). */
	const write = useCallback(
		async (
			section: "general" | "agent" | "models" | "appearance" | "graph" | "compaction",
			body: object,
		) => {
			setError(null);
			const res = await fetch(`/api/settings/${section}`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const detail = (await res.json().catch(() => ({}))) as {
					error?: string;
				};
				setError(`${section}: ${detail.error ?? res.status}`);
				return;
			}
			// Server truth, never the request body (fix wave, owner repro):
			// the models section clamps pinned thinking levels on write
			// (bd68486) — a swap that rides an unsupported level lands
			// CLAMPED in the record, and the writing surface must show the
			// stored value in this same interaction, not the optimistic one.
			const stored = (
				(await res.json().catch(() => null)) as { settings?: UserSettings } | null
			)?.settings;
			setRecord(
				(prev) =>
					stored ?? ({ ...(prev ?? {}), [section]: body }) as UserSettings,
			);
			notifySettingsSaved(section);
			if (section === "appearance")
				onAppearanceChange(body as AppearanceSettings);
		},
		[onAppearanceChange],
	);

	const nav = (
		<SideNav
			aria-label="Settings sections"
			data-testid="settings-nav"
			header={
				<HStack gap={2} align="center" paddingInline={2} className="min-h-8">
					<Heading level={4}>Settings</Heading>
				</HStack>
			}
			topContent={
				<TextInput
					label="Search settings"
					isLabelHidden
					placeholder="Search"
					size="sm"
					width="100%"
					hasClear
					startIcon={SearchIcon}
					data-testid="settings-search"
					value={search}
					onChange={setSearch}
					onEnter={() => matches[0] && setActive(matches[0].id)}
				/>
			}
		>
			{matches.length === 0 && (
				<Text type="supporting" className="px-2">
					No settings match.
				</Text>
			)}
			{SECTION_GROUPS.map((group) => {
				const items = matches.filter((m) => m.group === group);
				if (items.length === 0) return null;
				return (
					<SideNavSection key={group} title={group}>
						{items.map((s) => (
							<SideNavItem
								key={s.id}
								data-testid={`settings-nav-${s.id}`}
								label={s.label}
								icon={<s.Icon className="size-4" aria-hidden />}
								isSelected={active === s.id}
								onClick={() => setActive(s.id)}
							/>
						))}
					</SideNavSection>
				);
			})}
		</SideNav>
	);

	const closeButton = (
		<Tooltip content={hintText("Close", undefined, "escape")} placement="start" delay={TOOLTIP_DELAY_MS} hasHoverIndication={false}>
			<IconButton
				label="Close settings"
				data-testid="settings-close"
				variant="ghost"
				icon={<XIcon className="size-4" />}
				onClick={onClose}
			/>
		</Tooltip>
	);

	return (
		<SettingsSkinContext.Provider value={true}>
			<Layout
				data-testid="settings-dialog"
				className="h-[min(780px,calc(100dvh-2rem))]"
				start={narrow ? undefined : nav}
				header={
					narrow ? (
						<HStack gap={2} align="center" justify="between" paddingInline={4} paddingBlock={2}>
							<Selector
								label="Settings section"
								isLabelHidden
								size="sm"
								options={SECTIONS.map((s) => ({ value: s.id, label: s.label }))}
								value={active}
								onChange={(next) => next && setActive(next as SectionId)}
							/>
							{closeButton}
						</HStack>
					) : undefined
				}
				content={
				<div
					ref={contentRef}
					className="relative h-full min-w-0 overflow-y-auto"
					data-testid="settings-content"
				>
					{/* Close sits in the content pane's corner (no empty header band). */}
					{!narrow && <div className="sticky top-0 z-10 flex justify-end p-3 pb-0">{closeButton}</div>}
					{error && (
						<Banner status="error" title={error} collapsible={false} data-testid="settings-error" className="m-4" />
					)}
					{record === undefined ? (
						<HStack gap={2} align="center" padding={6}>
							<Spinner size="sm" />
							<Text type="supporting">Loading settings…</Text>
						</HStack>
					) : record === null ? (
						<Banner status="error" title="Settings could not be loaded — refresh to retry." collapsible={false} className="m-6" />
					) : (
						<div>
							{active === "general" && (
								<SettingsSection
									title="General"
									testid="section-general"
								>
									<UpdateSettings
										autoUpdate={record.general?.autoUpdate ?? true}
										onAutoUpdateChange={(on) =>
											void write("general", { ...record.general, autoUpdate: on })
										}
									/>
									<VoiceSettings />
								</SettingsSection>
							)}
							{active === "learner" && (
								<SettingsSection
									title="About you"
									hint="Your tutor reads this before every lesson."
									testid="section-learner"
								>
									<LearnerSection
										learner={record.learner}
										onSave={(next) => setRecord((prev) => ({ ...(prev ?? { version: CURRENT_SETTINGS_VERSION }), learner: next }))}
									/>
								</SettingsSection>
							)}
							{active === "anki" && (
								<SettingsSection title="Anki" hint="Study your knowledge map as flashcards." testid="section-anki">
									<AnkiSection
										anki={record.anki}
										onSave={(next) => setRecord((prev) => ({ ...(prev ?? { version: CURRENT_SETTINGS_VERSION }), anki: next }))}
									/>
								</SettingsSection>
							)}
							{active === "keys" && (
								<SettingsSection title="Providers" testid="section-keys">
									<KeysSection initialRow={initialRow ?? undefined} />
								</SettingsSection>
							)}
							{active === "agent" && (
								<SettingsSection
									title="Agent"
									testid="section-agent"
								>
									<AgentSection
										agent={record.agent}
										models={record.models}
										graph={record.graph}
										compaction={record.compaction}
										onModelsChange={(next: ModelsSettings) =>
											void write("models", next)
										}
										onSectionChange={(next: AgentSettings) =>
											void write("agent", next)
										}
										onCompactionChange={(next: CompactionSettings) =>
											void write("compaction", next)
										}
									/>
								</SettingsSection>
							)}
							{active === "appearance" && (
								<SettingsSection
									title="Appearance"
									testid="section-appearance"
								>
									<AppearanceSection
										appearance={record.appearance}
										onSectionChange={(next: AppearanceSettings) =>
											void write("appearance", next)
										}
									/>
								</SettingsSection>
							)}
							{active === "graph" && (
								<SettingsSection
									title="Graph"
									testid="section-graph"
								>
									<GraphSection
										graph={record.graph}
										onSectionChange={(next: GraphSettings) =>
											void write("graph", next)
										}
									/>
								</SettingsSection>
							)}
							{active === "keyboard" && (
								<SettingsSection
									title="Keyboard"
									hint="Stored on this device"
									testid="section-keyboard"
								>
									<KeyboardSection />
								</SettingsSection>
							)}
						</div>
					)}
				</div>
				}
			/>
		</SettingsSkinContext.Provider>
	);
}
