/**
 * First-run onboarding: one guided flow that takes a new learner from a
 * fresh install to a working tutor.
 *
 *   1. Welcome — what Kapany does and what setup involves.
 *   2. Connect — sign in with an AI subscription they already pay for
 *      (ChatGPT, GitHub Copilot, Grok), paste an API key, or run models
 *      locally with Ollama. Plans that can't be linked (Google AI Pro,
 *      Claude Pro/Max) say so plainly and offer the closest route.
 *   3. Models — Kapany fills the three model slots itself from what was
 *      connected (onboarding-picks.ts). "Choose myself" hands over to the
 *      slot pickers in the setup dialog.
 *   4. Ready — a few tips, then straight into the composer.
 *
 * Subscription sign-in reuses the Settings connection rows (the same
 * dialogs, consent notice and credential store), so there is one way to
 * connect an account, wherever it is started from.
 */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ExternalLinkIcon } from "lucide-react";
import { useBackdropDismiss } from "@/components/backdrop-dismiss";
import { Button } from "@/components/ui/button";
import { notifySettingsSaved, useSettingsSaved } from "@/components/settings-signal";
import { OllamaRow, type OllamaInfo, type ProviderKeyInfo } from "@/components/settings/keys-section";
import { ChatGPTConnection } from "@/components/settings/chatgpt-connection";
import { NativeSubscriptionConnection } from "@/components/settings/subscription-connections";
import { defaultOrderLevel } from "@/components/thinking-default";
import { prettyModel } from "@/components/usage-format";
import { recommendSlots } from "@/components/onboarding-picks";
import type { ModelCatalogEntry, ModelCatalogResponse, ModelSlotName, ModelsSettings } from "@/src/core";

export type OnboardingStep = "welcome" | "connect" | "models" | "ready";
const STEPS: readonly OnboardingStep[] = ["welcome", "connect", "models", "ready"];
const STEP_LABEL: Record<OnboardingStep, string> = { welcome: "Welcome", connect: "Connect", models: "Models", ready: "Ready" };

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

/** The API keys onboarding offers, with where to get one. */
const KEY_OPTIONS: { id: string; title: string; detail: string; url: string; urlLabel: string }[] = [
	{
		id: "google",
		title: "Google Gemini",
		detail: "Free with any Google account, Google AI Pro or not. Sign in, click Create API key, paste it here.",
		url: "https://aistudio.google.com/apikey",
		urlLabel: "Get a free key",
	},
	{
		id: "meta",
		title: "Meta Muse",
		detail: "The Muse models Kapany was built around.",
		url: "https://dev.meta.ai/docs/overview",
		urlLabel: "Get a Meta key",
	},
	{
		id: "anthropic",
		title: "Claude",
		detail: "A Claude Console key, billed per use. Separate from a Claude Pro or Max plan.",
		url: "https://console.anthropic.com/settings/keys",
		urlLabel: "Get a Claude key",
	},
	{
		id: "openai",
		title: "OpenAI",
		detail: "An OpenAI Platform key, billed per use. With ChatGPT Plus or Pro, sign in above instead.",
		url: "https://platform.openai.com/api-keys",
		urlLabel: "Get an OpenAI key",
	},
];

const SLOT_COPY: Record<ModelSlotName, { title: string; detail: string }> = {
	strong: { title: "Tutor", detail: "Measures what you know, plans and teaches" },
	cheap: { title: "Helpers", detail: "Builds your knowledge graph, grades, researches" },
	vision: { title: "Pictures and PDFs", detail: "Reads what you attach and draws diagrams" },
};
const SLOT_ORDER: readonly ModelSlotName[] = ["strong", "cheap", "vision"];

/** The live connection state the connect and models steps read. */
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
		if (open && section === "keys") void reload();
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

function Section({ title, detail, children }: { title: string; detail?: string; children: React.ReactNode }) {
	return (
		<section className="flex flex-col gap-3">
			<div>
				<h3 className="font-ui text-sm text-foreground">{title}</h3>
				{detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
			</div>
			{children}
		</section>
	);
}

function ConnectedBadge() {
	return (
		<span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[10px] text-foreground" data-testid="onboarding-connected">
			<CheckIcon className="size-3" />
			Connected
		</span>
	);
}

function Card({ children, testid }: { children: React.ReactNode; testid?: string }) {
	return (
		<div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 px-3 py-2.5" data-testid={testid}>
			{children}
		</div>
	);
}

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
	return (
		<a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-foreground underline underline-offset-2 hover:text-muted-foreground">
			{children}
			<ExternalLinkIcon className="size-3" />
		</a>
	);
}

/** One paste-a-key card. */
function KeyCard({
	option,
	envVar,
	connected,
}: {
	option: (typeof KEY_OPTIONS)[number];
	envVar: string | undefined;
	connected: boolean;
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
		notifySettingsSaved("keys");
	}
	return (
		<Card testid={`onboarding-key-${option.id}`}>
			<div className="flex items-center justify-between gap-3">
				<span className="font-ui text-xs text-foreground">{option.title}</span>
				{connected ? <ConnectedBadge /> : <DocLink href={option.url}>{option.urlLabel}</DocLink>}
			</div>
			<p className="text-[11px] leading-relaxed text-muted-foreground">{option.detail}</p>
			{!connected && envVar && (
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
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder="Paste key…"
						aria-label={`${option.title} key`}
						disabled={saving}
						className="h-7 min-w-0 flex-1 rounded-sm border border-border bg-background px-1.5 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-muted-foreground/50"
					/>
					<Button type="submit" size="xs" variant="outline" disabled={saving || !value.trim()}>
						{saving ? "Saving…" : "Save"}
					</Button>
				</form>
			)}
			{error && (
				<p role="alert" className="text-xs text-red-400">
					{error}
				</p>
			)}
		</Card>
	);
}

/** A subscription that can be linked: the shared Settings connection row. */
function SubscriptionCard({ title, detail, connected, children }: { title: string; detail: string; connected: boolean; children: React.ReactNode }) {
	return (
		<Card>
			<div className="flex items-center justify-between gap-3">
				<span className="font-ui text-xs text-foreground">{title}</span>
				{connected && <ConnectedBadge />}
			</div>
			<p className="text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
			{children}
		</Card>
	);
}

/** A subscription that can't be linked, and the closest thing that works. */
function UnlinkableCard({ title, why, instead }: { title: string; why: string; instead: string }) {
	return (
		<Card>
			<span className="font-ui text-xs text-muted-foreground">{title}</span>
			<p className="text-[11px] leading-relaxed text-muted-foreground">
				{why} <span className="text-foreground">{instead}</span>
			</p>
		</Card>
	);
}

function ConnectStep({ connections }: { connections: ReturnType<typeof useConnections> }) {
	const { connected, keyProviders, ollama, setOllama, reload } = connections;
	const envVar = (id: string) => keyProviders.find((p) => p.id === id)?.envVar;
	return (
		<div className="flex flex-col gap-6" data-testid="onboarding-connect">
			<Section title="Use an AI subscription you already have" detail="Sign in once and Kapany runs on your plan. No API key, no extra bill; your plan's usage limits apply.">
				<div className="grid gap-2 sm:grid-cols-2">
					<SubscriptionCard title="ChatGPT Plus or Pro" detail="Sign in with your OpenAI account." connected={connected.has("chatgpt")}>
						<ChatGPTConnection setup />
					</SubscriptionCard>
					<SubscriptionCard title="GitHub Copilot" detail="Free, Pro or Business. Uses the models your plan includes." connected={connected.has("github-copilot-subscription")}>
						<NativeSubscriptionConnection providerId="github-copilot" />
					</SubscriptionCard>
					<SubscriptionCard title="Grok (SuperGrok or X Premium)" detail="Sign in with your xAI account." connected={connected.has("xai-subscription")}>
						<NativeSubscriptionConnection providerId="xai" />
					</SubscriptionCard>
					<UnlinkableCard
						title="Google AI Pro / Gemini Advanced"
						why="Google doesn't let other apps sign in with a Gemini plan."
						instead="A Gemini API key is free to create instead, see below."
					/>
					<UnlinkableCard
						title="Claude Pro or Max"
						why="Anthropic's terms only allow Claude plans in Anthropic's own apps."
						instead="Use a Claude API key below, or another option here."
					/>
				</div>
			</Section>

			<Section title="Or paste an API key" detail="Keys stay on this computer, in Kapany's own settings file.">
				<div className="grid gap-2 sm:grid-cols-2">
					{KEY_OPTIONS.filter((o) => envVar(o.id)).map((o) => (
						<KeyCard key={o.id} option={o} envVar={envVar(o.id)} connected={connected.has(o.id)} />
					))}
				</div>
			</Section>

			<Section title="Or run models on this computer" detail="Free and private, but slower and less capable than the options above.">
				<Card>
					<OllamaRow
						ollama={ollama}
						onRecheck={() => {
							setOllama(undefined);
							void reload().then(() => notifySettingsSaved("keys"));
						}}
					/>
				</Card>
			</Section>
		</div>
	);
}

function ModelsStep({
	picks,
	saving,
	error,
}: {
	picks: Partial<Record<ModelSlotName, ModelCatalogEntry>>;
	saving: boolean;
	error: string | null;
}) {
	return (
		<div className="flex flex-col gap-4" data-testid="onboarding-models">
			<p className="text-sm text-muted-foreground">
				Kapany uses three models for different jobs. These are picked from what you connected, and you can change them any time in Settings.
			</p>
			<div className="flex flex-col divide-y divide-border rounded-md border border-border">
				{SLOT_ORDER.map((slot) => {
					const m = picks[slot];
					return (
						<div key={slot} className="flex items-center justify-between gap-4 px-3 py-2.5" data-testid={`onboarding-pick-${slot}`}>
							<div className="min-w-0">
								<div className="font-ui text-sm text-foreground">{SLOT_COPY[slot].title}</div>
								<div className="text-xs text-muted-foreground">{SLOT_COPY[slot].detail}</div>
							</div>
							<div className="min-w-0 text-right">
								<div className="truncate font-ui text-xs text-foreground">{m ? prettyModel(m.id) : "—"}</div>
								<div className="text-[11px] text-muted-foreground">{m ? (PROVIDER_LABEL[m.provider] ?? m.provider) : ""}</div>
							</div>
						</div>
					);
				})}
			</div>
			{picks.vision && !picks.vision.input.includes("image") && (
				<p className="text-xs text-muted-foreground">
					None of your connected models can see images, so attached pictures and PDFs are read as text only.
				</p>
			)}
			{saving && <p className="text-xs text-muted-foreground">Saving…</p>}
			{error && (
				<p role="alert" className="text-xs text-red-400">
					{error}
				</p>
			)}
		</div>
	);
}

function WelcomeStep() {
	return (
		<div className="flex flex-col gap-5" data-testid="onboarding-welcome">
			<p className="text-sm leading-relaxed text-foreground">
				Kapany is a tutor that first finds out what you already understand, then teaches from there, one step at a time.
			</p>
			<ol className="flex flex-col gap-3 text-sm">
				{[
					["Connect an AI", "Sign in with ChatGPT, Copilot or Grok, paste a key, or run a local model."],
					["Let Kapany pick models", "It chooses the right model for each job. You can change them later."],
					["Start learning", "Type what you want to understand, and the first lesson begins."],
				].map(([title, detail], i) => (
					<li key={title} className="flex gap-3">
						<span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border font-ui text-xs text-muted-foreground">{i + 1}</span>
						<span>
							<span className="font-ui text-foreground">{title}</span>
							<span className="block text-xs text-muted-foreground">{detail}</span>
						</span>
					</li>
				))}
			</ol>
			<p className="text-xs text-muted-foreground">It takes about a minute.</p>
		</div>
	);
}

function ReadyStep() {
	return (
		<div className="flex flex-col gap-4" data-testid="onboarding-ready">
			<p className="text-sm text-foreground">Kapany is ready. A few things worth knowing:</p>
			<ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
				<li>Type a goal, like “understand Kirchhoff’s laws”, and press Enter to start a lesson.</li>
				<li>Every question has a thinking field. Explain your reasoning there, typed or spoken; it’s how Kapany learns how you think.</li>
				<li>What you learn builds a knowledge graph on the home screen that later lessons start from.</li>
				<li>Connections, keys and models live in Settings if you want to change them.</li>
			</ul>
		</div>
	);
}

export function Onboarding({
	open,
	initialStep = "welcome",
	onClose,
	onDone,
	onChooseModels,
}: {
	open: boolean;
	initialStep?: OnboardingStep;
	onClose: () => void;
	/** The model slots were saved. */
	onDone: (models: ModelsSettings) => void;
	/** "Choose myself": hand over to the slot pickers. */
	onChooseModels: () => void;
}) {
	const [step, setStep] = useState<OnboardingStep>(initialStep);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const connections = useConnections(open, step === "connect");
	const backdropDismiss = useBackdropDismiss(onClose);

	useEffect(() => {
		if (open) {
			setStep(initialStep);
			setError(null);
		}
	}, [open, initialStep]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			// One Esc, one action: the window chain (dictation, abort) must not also fire.
			e.preventDefault();
			e.stopPropagation();
			onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;

	const models = connections.catalog?.models ?? [];
	const picks = recommendSlots(models);
	const anyConnected = connections.connected.size > 0 && models.length > 0;
	const allPicked = SLOT_ORDER.every((s) => picks[s]);
	const index = STEPS.indexOf(step);

	async function savePicks() {
		if (!allPicked || saving) return;
		setSaving(true);
		setError(null);
		const body: ModelsSettings = {};
		for (const slot of SLOT_ORDER) {
			const m = picks[slot]!;
			body[slot] = {
				model: { provider: m.provider, id: m.id },
				...(m.supportedLevels.length > 0 ? { thinkingLevel: defaultOrderLevel(m.supportedLevels) } : {}),
			};
		}
		const res = await fetch("/api/settings/models", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		}).catch(() => null);
		setSaving(false);
		if (!res || !res.ok) {
			setError(res ? `Save failed: ${(await res.json().catch(() => ({}))).error ?? res.status}` : "Save failed. Check your connection and try again.");
			return;
		}
		notifySettingsSaved("models");
		onDone(body);
		setStep("ready");
	}

	const footer: Record<OnboardingStep, React.ReactNode> = {
		welcome: (
			<Button size="sm" onClick={() => setStep("connect")} data-testid="onboarding-start">
				Get started
			</Button>
		),
		connect: (
			<>
				{!anyConnected && <span className="mr-auto text-xs text-muted-foreground">Connect at least one option to continue.</span>}
				<Button size="sm" disabled={!anyConnected} onClick={() => setStep("models")} data-testid="onboarding-continue">
					Continue
				</Button>
			</>
		),
		models: (
			<>
				<Button size="sm" variant="ghost" onClick={() => setStep("connect")}>
					Back
				</Button>
				<Button size="sm" variant="outline" onClick={onChooseModels} data-testid="onboarding-choose-models">
					Choose myself
				</Button>
				<Button size="sm" disabled={!allPicked || saving} onClick={() => void savePicks()} data-testid="onboarding-use-picks">
					Use these
				</Button>
			</>
		),
		ready: (
			<Button size="sm" onClick={onClose} data-testid="onboarding-finish">
				Start learning
			</Button>
		),
	};

	const title: Record<OnboardingStep, string> = {
		welcome: "Welcome to Kapany",
		connect: "Connect an AI",
		models: "Your models",
		ready: "You’re all set",
	};

	return createPortal(
		<div className="lh-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-background/80" data-testid="onboarding-backdrop" {...backdropDismiss}>
			<div
				role="dialog"
				aria-modal="true"
				aria-label="Set up Kapany"
				data-testid="onboarding"
				className="settings-dialog-pop mx-4 flex max-h-[90dvh] w-[720px] max-w-full flex-col overflow-hidden rounded-md border border-border bg-card shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				<header className="flex shrink-0 flex-col gap-3 border-b border-border px-6 pt-5 pb-4">
					<div className="flex items-center gap-3">
						<h2 className="font-title text-2xl tracking-tight">{title[step]}</h2>
						<button type="button" aria-label="Close setup" onClick={onClose} className="ml-auto text-muted-foreground transition-colors hover:text-foreground">
							✕
						</button>
					</div>
					<ol className="flex items-center gap-2" aria-label="Setup progress">
						{STEPS.map((s, i) => (
							<li key={s} className="flex flex-1 flex-col gap-1" aria-current={s === step ? "step" : undefined}>
								<span className={`h-0.5 rounded-full ${i <= index ? "bg-foreground" : "bg-border"}`} />
								<span className={`font-ui text-[11px] ${i === index ? "text-foreground" : "text-muted-foreground"}`}>{STEP_LABEL[s]}</span>
							</li>
						))}
					</ol>
				</header>
				<div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
					{step === "welcome" && <WelcomeStep />}
					{step === "connect" && <ConnectStep connections={connections} />}
					{step === "models" && <ModelsStep picks={picks} saving={saving} error={error} />}
					{step === "ready" && <ReadyStep />}
				</div>
				<footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-3">{footer[step]}</footer>
			</div>
		</div>,
		document.body,
	);
}
