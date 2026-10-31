/**
 * First-run onboarding: a full-screen, four-step flow that takes a new
 * learner from a fresh install to a harness that already knows how they like
 * to learn.
 *
 *   1. About — what TYSA is and what it's for.
 *   2. How you'll learn — the learning methods: learn (measure first),
 *      teach (guided), textbook and practice.
 *   3. Connect — everything on one page: sign in with an AI subscription,
 *      paste an API key, or run models locally.
 *   4. Models — the three model slots, prefilled from what was connected
 *      (onboarding-picks.ts) or the saved picks, each changeable in place.
 *   5. Make it yours — the learner types or says how they like to learn;
 *      their own model turns that into a short note per agent, composed
 *      AFTER the built-in prompts (agent/preferences.ts) so nothing breaks.
 *      Skipping, or a failed call, keeps the built-in prompts alone.
 *
 * Looks like the rest of the app: the home hero's heading (one outlined
 * word, the blur-rise reveal), Settings' flat rows and section titles, the
 * composer's shell and its quiet pill toggles. Monochrome, with the brand
 * blue (the TYSA mark's) kept for the next step: the main button, the
 * current step, progress, and the outlined headline word.
 * Illustrations (onboarding-art.tsx) sit only in the empty side panel.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	ArrowLeftIcon,
	ArrowRightIcon,
	BrainIcon,
	BookOpenIcon,
	CheckIcon,
	ChevronDownIcon,
	DumbbellIcon,
	ImageIcon,
	ExternalLinkIcon,
	GraduationCapIcon,
	InfoIcon,
	NetworkIcon,
	RouteIcon,
	SearchIcon,
	SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPOSER_SHELL } from "@/components/composer";
import { notifySettingsSaved, useSettingsSaved } from "@/components/settings-signal";
import { OllamaRow, type OllamaInfo, type ProviderKeyInfo } from "@/components/settings/keys-section";
import { ChatGPTConnection } from "@/components/settings/chatgpt-connection";
import { NativeSubscriptionConnection } from "@/components/settings/subscription-connections";
import { DictationButton, joinDictation, useDictation } from "@/components/dictation";
import { defaultOrderLevel } from "@/components/thinking-default";
import { prettyModel } from "@/components/usage-format";
import { recommendSlots } from "@/components/onboarding-picks";
import { OnboardingArt } from "@/components/onboarding-art";
import { MenuShell } from "@/components/menu-shell";
import { ModelMenuList } from "@/components/settings/model-menu";
import type { ModelCatalogEntry, ModelCatalogResponse, ModelSlotName, ModelsSettings } from "@/src/core";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

export type OnboardingStep = "about" | "methods" | "connect" | "models" | "preferences";
const STEPS: readonly OnboardingStep[] = ["about", "methods", "connect", "models", "preferences"];
const STEP_LABEL: Record<OnboardingStep, string> = {
	about: "About",
	methods: "How you'll learn",
	connect: "Connect your AI",
	models: "Models",
	preferences: "Make it yours",
};

/** How each catalog provider reads to a learner. */
export const PROVIDER_LABEL: Record<string, string> = {
	chatgpt: "ChatGPT",
	"github-copilot-subscription": "GitHub Copilot",
	"xai-subscription": "Grok",
	meta: "Meta Muse",
	google: "Google Gemini",
	anthropic: "Claude",
	openai: "OpenAI",
	ollama: "Ollama (this computer)",
};

const KEY_OPTIONS: { id: string; title: string; detail: string; url: string; urlLabel: string }[] = [
	{
		id: "google",
		title: "Google Gemini",
		detail: "Free with any Google account, Google AI Pro or not.",
		url: "https://aistudio.google.com/apikey",
		urlLabel: "Get a free key",
	},
	{ id: "meta", title: "Meta Muse", detail: "The Muse models TYSA was built around.", url: "https://dev.meta.ai/docs/overview", urlLabel: "Get a key" },
	{
		id: "anthropic",
		title: "Claude",
		detail: "A Claude Console key, billed per use. Separate from Claude Pro or Max.",
		url: "https://console.anthropic.com/settings/keys",
		urlLabel: "Get a key",
	},
	{
		id: "openai",
		title: "OpenAI",
		detail: "An OpenAI Platform key, billed per use.",
		url: "https://platform.openai.com/api-keys",
		urlLabel: "Get a key",
	},
];

const SLOT_COPY: Record<ModelSlotName, string> = { strong: "Teacher", cheap: "Helpers", vision: "Pictures and PDFs" };
const SLOT_ORDER: readonly ModelSlotName[] = ["strong", "cheap", "vision"];

const PREFERENCE_IDEAS = [
	"Keep explanations short",
	"Use real-life analogies",
	"I'm a complete beginner",
	"I'm preparing for an exam",
	"Challenge me with hard questions",
	"Explain in simple English",
];

/** The app's quiet pill: the selected-toggle fill, used for the primary action. */
const PILL = "rounded-full bg-(--pill) text-foreground hover:bg-(--pill-hover) hover:text-foreground";
/** The TYSA mark's blue: the one accent onboarding allows itself. */
const BRAND = "#2e8bff";
/** The main "next" action, in brand blue. */
const PRIMARY = "rounded-full bg-[#2e8bff] text-white hover:bg-[#2e8bff]/85 hover:text-white disabled:bg-(--pill) disabled:text-muted-foreground";

/* ---------- data ---------- */

function useConnections(open: boolean, poll: boolean) {
	const [catalog, setCatalog] = useState<ModelCatalogResponse | null>(null);
	const [keyProviders, setKeyProviders] = useState<ProviderKeyInfo[]>([]);
	const [ollama, setOllama] = useState<OllamaInfo | undefined>(undefined);
	const reload = useCallback(async () => {
		const [models, keys] = await Promise.all([
			fetch("/api/models", { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<ModelCatalogResponse>) : null)).catch(() => null),
			fetch("/api/keys", { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<{ providers?: ProviderKeyInfo[]; ollama?: OllamaInfo }>) : null)).catch(() => null),
		]);
		if (models) setCatalog(models);
		if (keys) {
			setKeyProviders(keys.providers ?? []);
			setOllama(keys.ollama);
		}
	}, []);
	useEffect(() => {
		if (open) void reload();
	}, [open, reload]);
	useSettingsSaved((section) => {
		if (open && (section === "keys" || section === "models")) void reload();
	});
	// Subscription sign-ins finish in another tab: re-read while the
	// learner is on the connect step, and whenever they come back.
	useEffect(() => {
		if (!open || !poll) return;
		const timer = window.setInterval(() => void reload(), 3000);
		const onFocus = () => void reload();
		window.addEventListener("focus", onFocus);
		return () => {
			window.clearInterval(timer);
			window.removeEventListener("focus", onFocus);
		};
	}, [open, poll, reload]);
	const connected = new Set((catalog?.providers ?? []).filter((p) => p.keyPresent).map((p) => p.id));
	return { catalog, keyProviders, ollama, setOllama, connected, reload };
}

/** The models TYSA will run: the saved slots when all three are set,
 *  else the automatic picks (saved when the learner continues). */
function effectiveModels(catalog: ModelCatalogResponse | null): {
	picks: Partial<Record<ModelSlotName, ModelCatalogEntry>>;
	saved: boolean;
} {
	const models = catalog?.models ?? [];
	const fromSlots: Partial<Record<ModelSlotName, ModelCatalogEntry>> = {};
	for (const slot of SLOT_ORDER) {
		const pin = catalog?.slots?.[slot]?.model;
		const entry = pin ? models.find((m) => m.provider === pin.provider && m.id === pin.id) : undefined;
		if (entry) fromSlots[slot] = entry;
	}
	if (SLOT_ORDER.every((s) => fromSlots[s])) return { picks: fromSlots, saved: true };
	return { picks: recommendSlots(models), saved: false };
}

async function saveModels(
	picks: Partial<Record<ModelSlotName, ModelCatalogEntry>>,
	catalog: ModelCatalogResponse | null,
): Promise<ModelsSettings | string> {
	const body: ModelsSettings = {};
	for (const slot of SLOT_ORDER) {
		const m = picks[slot]!;
		// An unchanged pick keeps its saved thinking level; a new one gets the default.
		const pin = catalog?.slots?.[slot];
		const kept = pin?.model.provider === m.provider && pin.model.id === m.id ? (pin.thinkingLevel as ThinkingLevel | undefined) : undefined;
		const level = kept ?? (m.supportedLevels.length > 0 ? defaultOrderLevel(m.supportedLevels) : undefined);
		body[slot] = { model: { provider: m.provider, id: m.id }, ...(level ? { thinkingLevel: level } : {}) };
	}
	const res = await fetch("/api/settings/models", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	}).catch(() => null);
	if (!res || !res.ok) return res ? `Saving your models failed: ${(await res.json().catch(() => ({}))).error ?? res.status}` : "Saving your models failed. Check your connection and try again.";
	notifySettingsSaved("models");
	return body;
}

/* ---------- building blocks (the home hero + Settings' language) ---------- */

/** The home hero's heading: plain words, then one outlined word. */
function Hero({ plain, outlined, children }: { plain: string; outlined: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-4">
			<h1 className="text-3xl font-medium text-foreground sm:text-5xl sm:leading-[1.15]">
				{plain} <span className="lh-outline-text onb-brand-outline">{outlined}</span>
			</h1>
			<p className="max-w-xl text-base text-muted-foreground sm:text-lg">{children}</p>
		</div>
	);
}

/** Settings' section title (SettingsGroup). */
function Group({ label, hint, children, testid }: { label: string; hint?: string; children: React.ReactNode; testid?: string }) {
	return (
		<section className="flex flex-col" data-testid={testid}>
			<h3 className="mb-1 text-base font-medium text-foreground">{label}</h3>
			{hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}
			<div className="flex flex-col">{children}</div>
		</section>
	);
}

/** One flat row, the Settings row shape: name left, state or action right. */
function Row({ title, detail, aside, children, testid }: { title: string; detail?: string; aside?: React.ReactNode; children?: React.ReactNode; testid?: string }) {
	return (
		<div className="flex flex-col gap-2 border-b border-border/50 px-1 py-3 last:border-b-0" data-testid={testid}>
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<div className="text-sm text-foreground">{title}</div>
					{detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
				</div>
				{aside && <div className="shrink-0">{aside}</div>}
			</div>
			{children}
		</div>
	);
}

function Connected() {
	return (
		<span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="onboarding-connected">
			<CheckIcon className="size-3.5" style={{ color: BRAND }} />
			Connected
		</span>
	);
}

/* ---------- step 1: about ---------- */

function AboutStep() {
	const facts: [typeof SearchIcon, string, string][] = [
		[SearchIcon, "It finds where your understanding ends", "A few short questions first, so it never re-teaches what you know or skips what you don't."],
		[RouteIcon, "It teaches from there, one step at a time", "A path from what you know to your goal, changed as soon as your answers surprise it."],
		[NetworkIcon, "It remembers what you learn", "Everything becomes your knowledge graph, and later lessons build on it."],
	];
	return (
		<div className="flex flex-col gap-10" data-testid="onboarding-about">
			<Hero plain="Teach yourself" outlined="anything">
				TYSA is a learning harness that starts from what you already know. Tell it what you want to understand and it builds the lesson around you.
			</Hero>
			<div className="flex flex-col gap-5">
				{facts.map(([Icon, title, detail]) => (
					<div key={title} className="flex gap-3">
						<Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
						<div>
							<div className="text-sm text-foreground">{title}</div>
							<div className="mt-0.5 text-sm text-muted-foreground">{detail}</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

/* ---------- step 2: methods ---------- */

function MethodsStep() {
	const methods: { icon: typeof SearchIcon; name: string; mode?: string; detail: string; flow: string[] }[] = [
		{
			icon: SearchIcon,
			name: "Learn",
			detail: "Every session starts by measuring: short questions about the ideas your goal depends on, how sure you are, and why.",
			flow: ["Questions", "Confidence", "Your plan"],
		},
		{
			icon: GraduationCapIcon,
			name: "Teach",
			mode: "Guided",
			detail: "Step by step. You predict, it explains, then it checks you really got it before moving on.",
			flow: ["Predict", "Explain", "Check"],
		},
		{
			icon: BookOpenIcon,
			name: "Textbook",
			mode: "Textbook",
			detail: "Reads like a chapter written for you: intuition first, then sections and exercises. Attach your own PDFs too.",
			flow: ["Intuition", "Sections", "Exercises"],
		},
		{
			icon: DumbbellIcon,
			name: "Practice",
			mode: "Practice",
			detail: "Varied problems where you recall the right idea without being told which one. Hints adapt to how you reason.",
			flow: ["Problems", "Hints", "Recall"],
		},
	];
	return (
		<div className="flex flex-col gap-10" data-testid="onboarding-methods">
			<Hero plain="Four ways to" outlined="learn">
				Pick a style under the composer before you start. Whichever you choose, every question has a thinking field for your reasoning, typed or spoken.
			</Hero>
			<div className="flex flex-col">
				{methods.map((m) => (
					<div key={m.name} className="flex gap-4 border-b border-border/50 py-4 last:border-b-0" data-testid={`onboarding-method-${m.name.toLowerCase()}`}>
						<m.icon className="mt-1 size-4 shrink-0 text-muted-foreground" />
						<div className="flex min-w-0 flex-1 flex-col gap-2">
							<div className="flex items-baseline justify-between gap-3">
								<span className="text-base font-medium text-foreground">{m.name}</span>
								{m.mode && <span className="rounded-lg bg-(--pill) px-2 py-0.5 text-xs text-foreground">{m.mode}</span>}
							</div>
							<p className="text-sm text-muted-foreground">{m.detail}</p>
							<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
								{m.flow.map((s, i) => (
									<span key={s} className="flex items-center gap-1.5">
										{s}
										{i < m.flow.length - 1 && <ArrowRightIcon className="size-3 opacity-60" />}
									</span>
								))}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

/* ---------- step 3: connect ---------- */

/** One row of a connect list: a quiet glyph tile, name and note, and a
 *  single action on the right. Anything extra (a key form) opens below. */
function OptionRow({
	glyph,
	title,
	detail,
	action,
	children,
	testid,
}: {
	glyph: React.ReactNode;
	title: string;
	detail: string;
	action: React.ReactNode;
	children?: React.ReactNode;
	testid?: string;
}) {
	return (
		<div className="flex flex-col" data-testid={testid}>
			<div className="flex items-center gap-3 px-4 py-3">
				<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--pill) text-sm text-foreground" aria-hidden>
					{glyph}
				</span>
				<div className="min-w-0 flex-1">
					<div className="text-sm text-foreground">{title}</div>
					<div className="truncate text-xs text-muted-foreground">{detail}</div>
				</div>
				<div className="shrink-0">{action}</div>
			</div>
			{children}
		</div>
	);
}

/** A grouped list: one hairline box, rows divided inside it. */
function OptionList({ children }: { children: React.ReactNode }) {
	return <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">{children}</div>;
}

const ACTION = "rounded-full px-3 py-1 text-xs transition-colors";

function KeyRow({
	option,
	envVar,
	connected,
	open,
	onToggle,
}: {
	option: (typeof KEY_OPTIONS)[number];
	envVar: string | undefined;
	connected: boolean;
	open: boolean;
	onToggle: () => void;
}) {
	const [value, setValue] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function save() {
		if (!envVar || !value.trim() || saving) return;
		setSaving(true);
		setError(null);
		const res = await fetch(`/api/keys/${encodeURIComponent(envVar)}`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ value }),
		}).catch(() => null);
		setSaving(false);
		if (!res || !res.ok) {
			const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
			setError(res ? (body?.error ?? `Save failed (${res.status})`) : "Save failed. Check your connection and try again.");
			return;
		}
		setValue("");
		onToggle();
		notifySettingsSaved("keys");
	}
	const action = connected ? (
		<Connected />
	) : (
		<button
			type="button"
			onClick={onToggle}
			aria-expanded={open}
			data-testid={`onboarding-key-${option.id}-toggle`}
			className={`${ACTION} ${open ? "text-muted-foreground hover:text-foreground" : "bg-(--pill) text-foreground hover:bg-(--pill-hover)"}`}
		>
			{open ? "Cancel" : "Add key"}
		</button>
	);
	return (
		<OptionRow glyph={option.title[0]} title={option.title} detail={option.detail} action={action} testid={`onboarding-key-${option.id}`}>
			{open && !connected && envVar && (
				<div className="onb-enter flex flex-col gap-3 bg-(--pill)/30 px-4 pt-1 pb-4 sm:pl-15">
					<ol className="flex flex-col gap-1.5 text-xs text-muted-foreground">
						<li className="flex items-center gap-2">
							<span className="flex size-4 items-center justify-center rounded-full border border-border text-[10px]">1</span>
							<a href={option.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline">
								{option.urlLabel}
								<ExternalLinkIcon className="size-3" />
							</a>
							<span>opens in your browser</span>
						</li>
						<li className="flex items-center gap-2">
							<span className="flex size-4 items-center justify-center rounded-full border border-border text-[10px]">2</span>
							Copy the key and paste it here
						</li>
					</ol>
					<form
						className="flex items-center gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							void save();
						}}
					>
						<input
							type="password"
							autoComplete="off"
							autoFocus
							value={value}
							onChange={(e) => setValue(e.target.value)}
							placeholder={`Paste your ${option.title} key`}
							aria-label={`${option.title} key`}
							disabled={saving}
							className="h-9 min-w-0 flex-1 rounded-full border border-input/70 bg-background px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-muted-foreground/60"
						/>
						<Button type="submit" size="sm" variant="ghost" className={PILL} disabled={saving || !value.trim()}>
							{saving ? "Checking…" : "Save"}
						</Button>
					</form>
					{error && (
						<p role="alert" className="text-xs text-red-400">
							{error}
						</p>
					)}
				</div>
			)}
		</OptionRow>
	);
}

/** What's connected so far, so the learner sees progress as they go. */
function ConnectedSummary({ connected }: { connected: Set<string> }) {
	const names = [...connected].map((id) => PROVIDER_LABEL[id] ?? id);
	return (
		<div className="-mt-4 flex flex-wrap items-center gap-2 text-xs" data-testid="onboarding-connected-summary">
			{names.length === 0 ? (
				<span className="text-muted-foreground">Nothing connected yet. Pick any one option below.</span>
			) : (
				<>
					<span className="text-muted-foreground">Connected:</span>
					{names.map((n) => (
						<span key={n} className="inline-flex items-center gap-1 rounded-lg bg-(--pill) px-2 py-0.5 text-foreground">
							<CheckIcon className="size-3" style={{ color: BRAND }} />
							{n}
						</span>
					))}
				</>
			)}
		</div>
	);
}

function ConnectStep({ connections }: { connections: ReturnType<typeof useConnections> }) {
	const { connected, keyProviders, ollama, setOllama, reload } = connections;
	const envVar = (id: string) => keyProviders.find((p) => p.id === id)?.envVar;
	// One key form open at a time; the first unconnected key starts closed.
	const [openKey, setOpenKey] = useState<string | null>(null);
	return (
		<div className="flex flex-col gap-10" data-testid="onboarding-connect">
			<Hero plain="Connect your" outlined="AI">
				Sign in with a subscription you already pay for, paste an API key, or run a model on this computer. One is enough.
			</Hero>

			<ConnectedSummary connected={connected} />

			<Group label="Use a subscription" hint="No API key and no extra bill. TYSA runs on your plan and its usage limits.">
				<OptionList>
					<OptionRow
						glyph="C"
						title="ChatGPT"
						detail="Plus or Pro"
						action={<span className="flex items-center gap-3">{connected.has("chatgpt") && <Connected />}<ChatGPTConnection setup hideLabel /></span>}
					/>
					<OptionRow
						glyph="G"
						title="GitHub Copilot"
						detail="Free, Pro or Business"
						action={<span className="flex items-center gap-3">{connected.has("github-copilot-subscription") && <Connected />}<NativeSubscriptionConnection providerId="github-copilot" hideLabel /></span>}
					/>
					<OptionRow
						glyph="X"
						title="Grok"
						detail="SuperGrok or X Premium"
						action={<span className="flex items-center gap-3">{connected.has("xai-subscription") && <Connected />}<NativeSubscriptionConnection providerId="xai" hideLabel /></span>}
					/>
				</OptionList>
				<p className="flex gap-2 px-1 pt-3 text-xs text-muted-foreground">
					<InfoIcon className="mt-px size-3.5 shrink-0" />
					Google AI Pro and Claude Pro/Max can't be linked, because Google and Anthropic don't allow it. Add a free Gemini key or a Claude key below instead.
				</p>
			</Group>

			<Group label="Or add an API key" hint="Keys stay on this computer, in TYSA's own settings file.">
				<OptionList>
					{KEY_OPTIONS.filter((o) => envVar(o.id)).map((o) => (
						<KeyRow
							key={o.id}
							option={o}
							envVar={envVar(o.id)}
							connected={connected.has(o.id)}
							open={openKey === o.id}
							onToggle={() => setOpenKey(openKey === o.id ? null : o.id)}
						/>
					))}
				</OptionList>
			</Group>

			<Group label="Or run a model on this computer" hint="Free and private, but slower and less capable.">
				<OptionList>
					<div className="px-3 py-2">
						<OllamaRow
							ollama={ollama}
							onRecheck={() => {
								setOllama(undefined);
								void reload().then(() => notifySettingsSaved("keys"));
							}}
						/>
					</div>
				</OptionList>
			</Group>

		</div>
	);
}

/* ---------- step 4: models ---------- */

const SLOT_DETAIL: Record<ModelSlotName, { icon: typeof SearchIcon; detail: string }> = {
	strong: { icon: GraduationCapIcon, detail: "Measures what you know, plans and teaches. Pick your best model." },
	cheap: { icon: BrainIcon, detail: "Builds your knowledge graph, grades and researches in the background. A fast, cheap model is fine." },
	vision: { icon: ImageIcon, detail: "Reads the pictures and PDFs you attach and draws diagrams. Needs a model that can see images." },
};

function ModelsStep({
	catalog,
	picks,
	recommended,
	onPick,
	onReset,
	error,
}: {
	catalog: ModelCatalogResponse | null;
	picks: Partial<Record<ModelSlotName, ModelCatalogEntry>>;
	recommended: Partial<Record<ModelSlotName, ModelCatalogEntry>>;
	onPick: (slot: ModelSlotName, model: ModelCatalogEntry) => void;
	onReset: () => void;
	error: string | null;
}) {
	const [openSlot, setOpenSlot] = useState<ModelSlotName | null>(null);
	const models = catalog?.models ?? [];
	const same = (a?: ModelCatalogEntry, b?: ModelCatalogEntry) => !!a && !!b && a.provider === b.provider && a.id === b.id;
	const allRecommended = SLOT_ORDER.every((s) => same(picks[s], recommended[s]));

	// The open menu owns Esc and outside clicks (the setup dialog's pattern).
	useEffect(() => {
		if (!openSlot) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			e.preventDefault();
			e.stopImmediatePropagation();
			setOpenSlot(null);
		};
		const onPointerDown = (e: PointerEvent) => {
			if (!(e.target instanceof Element)) return;
			if (e.target.closest("[data-lh-menu]") || e.target.closest(`[data-testid="onboarding-model-${openSlot}"]`)) return;
			setOpenSlot(null);
		};
		document.addEventListener("keydown", onKey, true);
		document.addEventListener("pointerdown", onPointerDown);
		return () => {
			document.removeEventListener("keydown", onKey, true);
			document.removeEventListener("pointerdown", onPointerDown);
		};
	}, [openSlot]);

	return (
		<div className="flex flex-col gap-10" data-testid="onboarding-models">
			<Hero plain="Choose your" outlined="models">
				TYSA uses three models, each for a different job. They're picked from what you connected. Keep them, or change any one.
			</Hero>
			<div className="flex flex-col gap-3">
				<OptionList>
					{SLOT_ORDER.map((slot) => {
						const m = picks[slot];
						const Icon = SLOT_DETAIL[slot].icon;
						const list = slot === "vision" ? models.filter((x) => x.input.includes("image")) : models;
						return (
							<div key={slot} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center" data-testid={`onboarding-pick-${slot}`}>
								<div className="flex min-w-0 flex-1 items-start gap-3">
									<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--pill) text-foreground" aria-hidden>
										<Icon className="size-4" />
									</span>
									<div className="min-w-0">
										<div className="flex items-center gap-2 text-sm text-foreground">
											{SLOT_COPY[slot]}
											{same(m, recommended[slot]) && (
												<span className="inline-flex items-center gap-1 text-[11px]" style={{ color: BRAND }}>
													<SparklesIcon className="size-3" />
													Recommended
												</span>
											)}
										</div>
										<div className="text-xs text-muted-foreground">{SLOT_DETAIL[slot].detail}</div>
									</div>
								</div>
								<div className="shrink-0 sm:w-60">
									<button
										type="button"
										data-testid={`onboarding-model-${slot}`}
										aria-expanded={openSlot === slot}
										aria-label={`${SLOT_COPY[slot]} model`}
										onClick={() => setOpenSlot(openSlot === slot ? null : slot)}
										className={`flex h-10 w-full items-center gap-2 rounded-full border bg-background px-4 text-left transition-colors ${
											openSlot === slot ? "border-[#2e8bff]" : "border-input/70 hover:border-muted-foreground/50"
										}`}
									>
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm text-foreground">{m ? prettyModel(m.id) : "Pick a model…"}</span>
											{m && <span className="block truncate text-[11px] leading-tight text-muted-foreground">{PROVIDER_LABEL[m.provider] ?? m.provider}</span>}
										</span>
										<ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
									</button>
									{openSlot === slot && (
										<MenuShell
											anchorTestid={`onboarding-model-${slot}`}
											testid={`onboarding-model-menu-${slot}`}
											preferredSide="down"
											align="right"
											menuClass="flex w-[22rem] flex-col rounded-xl border border-border bg-card p-2 text-xs shadow-xl"
										>
											<ModelMenuList
												models={list}
												effectiveId={m?.id}
												effectiveProvider={m?.provider}
												onPick={(picked) => {
													onPick(slot, picked);
													setOpenSlot(null);
												}}
												footer={list.length === 0 ? "None of your connected models can see images. Connect one that can, or attachments are read as text." : undefined}
											/>
										</MenuShell>
									)}
								</div>
							</div>
						);
					})}
				</OptionList>
				<div className="flex items-center justify-between gap-3 px-1">
					<span className="text-xs text-muted-foreground">You can change these any time in Settings → Agent.</span>
					{!allRecommended && (
						<button type="button" onClick={onReset} className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-(--pill) hover:text-foreground">
							Use recommended
						</button>
					)}
				</div>
				{error && (
					<p role="alert" className="px-1 text-xs text-red-400">
						{error}
					</p>
				)}
			</div>
		</div>
	);
}

/* ---------- step 5: preferences ---------- */

interface PreferencesBody {
	request: string;
	notes: Record<string, string>;
}

const NOTE_LABEL: Record<string, string> = {
	shared: "Everywhere",
	prober: "Measuring what you know",
	teacher: "Guided",
	textbook: "Textbook",
	practice: "Practice",
};

function PreferencesStep({
	text,
	setText,
	saved,
	busy,
	error,
	onSave,
}: {
	text: string;
	setText: (t: string) => void;
	saved: PreferencesBody | null;
	busy: boolean;
	error: string | null;
	onSave: () => void;
}) {
	const textRef = useRef(text);
	textRef.current = text;
	const dictation = useDictation({ append: (t) => setText(joinDictation(textRef.current, t)) });
	const notes = saved ? Object.entries(saved.notes).filter(([, v]) => v) : [];
	return (
		<div className="flex flex-col gap-10" data-testid="onboarding-preferences">
			<Hero plain="Make it" outlined="yours">
				How do you like to learn? Your level, your pace, the examples that click, what it's for. TYSA adds this on top of how it already teaches, so nothing breaks.
			</Hero>

			<div className="flex flex-col gap-3">
				<div className={`${COMPOSER_SHELL} flex flex-col`}>
					<textarea
						value={text}
						onChange={(e) => setText(e.target.value)}
						rows={5}
						placeholder="I'm a first-year engineering student. Keep it short, use everyday analogies, and push me harder once I get something right."
						aria-label="Your learning preferences"
						data-testid="onboarding-preferences-input"
						className="block w-full resize-none bg-transparent px-5 pt-4 text-base text-foreground outline-none placeholder:text-muted-foreground/60"
					/>
					<div className="flex items-center justify-between gap-2 px-3 pb-3">
						<span className="pl-2 text-xs text-muted-foreground">{dictation.active ? "Listening…" : "Type, or talk it out"}</span>
						<DictationButton dictation={dictation} />
					</div>
				</div>
				<div className="flex flex-wrap gap-0.5">
					{PREFERENCE_IDEAS.map((idea) => (
						<button
							key={idea}
							type="button"
							onClick={() => setText(text.trim() ? `${text.trim().replace(/[.,;]?$/, ".")} ${idea}.` : `${idea}.`)}
							className="rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-(--pill) hover:text-foreground"
						>
							{idea}
						</button>
					))}
				</div>
				<div className="flex items-center gap-3 pt-2">
					<Button variant="ghost" className={PILL} disabled={busy || !text.trim()} onClick={onSave} data-testid="onboarding-preferences-save">
						{busy ? "Tailoring…" : saved?.request ? "Update my teaching" : "Tailor my teaching"}
					</Button>
					{busy && <span className="text-xs text-muted-foreground">Your AI is writing a note for each part of TYSA.</span>}
				</div>
				{error && (
					<p role="alert" className="text-xs text-red-400">
						{error} TYSA keeps its default teaching style.
					</p>
				)}
			</div>

			{notes.length > 0 && (
				<Group label="What changes" hint="Added after TYSA's own instructions. Its method stays the same." testid="onboarding-preference-notes">
					{notes.map(([target, note]) => (
						<Row key={target} title={NOTE_LABEL[target] ?? target}>
							<div className="text-xs whitespace-pre-wrap text-muted-foreground">{note}</div>
						</Row>
					))}
				</Group>
			)}
		</div>
	);
}

/* ---------- the shell ---------- */

const STYLES = `
@keyframes onb-enter { from { opacity: 0; filter: blur(8px); transform: translateY(10px); } to { opacity: 1; filter: blur(0); transform: none; } }
@keyframes onb-drift { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.onb-enter { animation: onb-enter 700ms cubic-bezier(.2,.7,.2,1) both; }
.onb-drift { animation: onb-drift 7s ease-in-out infinite; transform-box: fill-box; }
.onb-delay-1 { animation-delay: -2.3s; }
.onb-delay-2 { animation-delay: -4.6s; }
.onb-brand-outline { -webkit-text-stroke-color: #2e8bff; }
@supports not (-webkit-text-stroke: 1px black) { .onb-brand-outline { color: #2e8bff; } }
@media (prefers-reduced-motion: reduce) { .onb-enter, .onb-drift { animation: none; } }
`;

export function Onboarding({
	open,
	initialStep = "about",
	onClose,
	onDone,
}: {
	open: boolean;
	initialStep?: OnboardingStep;
	onClose: () => void;
	/** The model slots were saved. */
	onDone: (models: ModelsSettings) => void;
}) {
	const [step, setStep] = useState<OnboardingStep>(initialStep);
	const [modelError, setModelError] = useState<string | null>(null);
	const [savingModels, setSavingModels] = useState(false);
	/** Model picks the learner changed on the Models page (else the effective ones). */
	const [chosen, setChosen] = useState<Partial<Record<ModelSlotName, ModelCatalogEntry>>>({});
	const [prefText, setPrefText] = useState("");
	const [prefSaved, setPrefSaved] = useState<PreferencesBody | null>(null);
	const [prefBusy, setPrefBusy] = useState(false);
	const [prefError, setPrefError] = useState<string | null>(null);
	const connections = useConnections(open, step === "connect");
	const scrollRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		setStep(initialStep);
		setChosen({});
		setModelError(null);
		setPrefError(null);
		fetch("/api/preferences", { cache: "no-store" })
			.then((r) => (r.ok ? (r.json() as Promise<PreferencesBody>) : null))
			.then((body) => {
				if (!body) return;
				setPrefSaved(body);
				setPrefText(body.request);
			})
			.catch(() => undefined);
	}, [open, initialStep]);

	useEffect(() => {
		scrollRef.current?.scrollTo({ top: 0 });
	}, [step]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			// An open model menu owns Esc while it's up.
			if (e.key !== "Escape" || document.querySelector("[data-lh-menu]")) return;
			// One Esc, one action: the window chain (dictation, abort) must not also fire.
			e.preventDefault();
			e.stopPropagation();
			onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;

	const index = STEPS.indexOf(step);
	const { picks: effective, saved: modelsSaved } = effectiveModels(connections.catalog);
	const recommended = recommendSlots(connections.catalog?.models ?? []);
	const picks: Partial<Record<ModelSlotName, ModelCatalogEntry>> = { ...effective, ...chosen };
	const modelsReady = SLOT_ORDER.every((s) => picks[s]);
	const connectedAny = (connections.catalog?.models.length ?? 0) > 0;

	async function next() {
		if (step === "models") {
			if (!modelsSaved || Object.keys(chosen).length > 0) {
				setSavingModels(true);
				setModelError(null);
				const result = await saveModels(picks, connections.catalog);
				setSavingModels(false);
				if (typeof result === "string") {
					setModelError(result);
					return;
				}
				setChosen({});
				onDone(result);
			}
			setStep("preferences");
			return;
		}
		if (step === "preferences") {
			onClose();
			return;
		}
		setStep(STEPS[index + 1]!);
	}

	async function savePreferences() {
		if (!prefText.trim() || prefBusy) return;
		setPrefBusy(true);
		setPrefError(null);
		const res = await fetch("/api/preferences", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ text: prefText }),
		}).catch(() => null);
		setPrefBusy(false);
		const body = (await res?.json().catch(() => null)) as (PreferencesBody & { error?: string }) | null;
		if (!res || !res.ok || !body) {
			setPrefError(body?.error ?? "Your preferences could not be saved.");
			return;
		}
		setPrefSaved(body);
	}

	const primaryLabel: Record<OnboardingStep, string> = {
		about: "Get started",
		methods: "Continue",
		connect: "Continue",
		models: savingModels ? "Saving…" : modelsSaved && Object.keys(chosen).length === 0 ? "Continue" : "Save and continue",
		preferences: prefSaved?.request ? "Start learning" : "Skip and start learning",
	};
	const primaryDisabled =
		(step === "connect" && !connectedAny) || (step === "models" && (!modelsReady || savingModels)) || (step === "preferences" && prefBusy);

	return createPortal(
		<div role="dialog" aria-modal="true" aria-label="Set up TYSA" data-testid="onboarding" className="fixed inset-0 z-50 flex flex-col bg-background">
			<style>{STYLES}</style>
			<header className="flex h-15 shrink-0 items-center gap-6 px-4 sm:px-8">
				<span className="flex items-center gap-2">
					<img src="/favicon.svg" alt="" className="size-6 rounded-md" />
					<span className="font-brand text-base tracking-tight text-foreground">TYSA</span>
				</span>
				<ol className="mx-auto hidden items-center gap-0.5 md:flex" aria-label="Setup progress">
					{STEPS.map((s, i) => (
						<li key={s} aria-current={s === step ? "step" : undefined}>
							<button
								type="button"
								disabled={i > index}
								onClick={() => setStep(s)}
								className={`rounded-lg px-2 py-1 text-sm transition-colors disabled:cursor-default ${
									i === index ? "bg-[#2e8bff]/15 text-[#4ca3ff]" : i < index ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/50"
								}`}
							>
								{STEP_LABEL[s]}
							</button>
						</li>
					))}
				</ol>
				<span className="ml-auto text-xs text-muted-foreground md:hidden">
					{index + 1} / {STEPS.length}
				</span>
				<button type="button" onClick={onClose} data-testid="onboarding-skip" className="rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
					{step === "preferences" ? "Close" : "Skip for now"}
				</button>
			</header>
			{/* Progress, in brand blue. */}
			<div className="h-0.5 shrink-0 bg-border/40" aria-hidden>
				<div className="h-full transition-[width] duration-500 ease-out" style={{ width: `${((index + 1) / STEPS.length) * 100}%`, background: BRAND }} />
			</div>

			<div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
				<div ref={scrollRef} className="min-h-0 overflow-y-auto">
					<div key={step} className="onb-enter mx-auto w-full max-w-2xl px-4 py-10 sm:px-8 sm:py-16">
						{step === "about" && <AboutStep />}
						{step === "methods" && <MethodsStep />}
						{step === "connect" && <ConnectStep connections={connections} />}
						{step === "models" && (
							<ModelsStep
								catalog={connections.catalog}
								picks={picks}
								recommended={recommended}
								onPick={(slot, model) => setChosen((prev) => ({ ...prev, [slot]: model }))}
								onReset={() => setChosen(recommended)}
								error={modelError}
							/>
						)}
						{step === "preferences" && (
							<PreferencesStep text={prefText} setText={setPrefText} saved={prefSaved} busy={prefBusy} error={prefError} onSave={() => void savePreferences()} />
						)}
					</div>
				</div>
				<aside className="relative hidden items-center justify-center overflow-hidden p-12 lg:flex">
					<OnboardingArt step={step} />
				</aside>
			</div>

			<footer className="flex shrink-0 items-center gap-3 px-4 py-4 sm:px-8">
				{index > 0 ? (
					<button type="button" onClick={() => setStep(STEPS[index - 1]!)} data-testid="onboarding-back" className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
						<ArrowLeftIcon className="size-4" />
						Back
					</button>
				) : (
					<span />
				)}
				{step === "connect" && !connectedAny && <span className="text-xs text-muted-foreground max-sm:hidden">Connect one option to continue.</span>}
				<Button variant="ghost" className={`ml-auto ${PRIMARY}`} disabled={primaryDisabled} onClick={() => void next()} data-testid="onboarding-next">
					{primaryLabel[step]}
					{step !== "preferences" && <ArrowRightIcon />}
				</Button>
			</footer>
		</div>,
		document.body,
	);
}
