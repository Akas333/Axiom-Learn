/**
 * The first-run setup flow (model-slots wave, 2026-09-20, owner design
 * "A — composer CTA + send interception"): chats cannot start until the
 * user has picked all three model slots — there are no defaults for 33
 * providers. The graph view's new-session dock (the app's home, where
 * chats start) shows a "Set up your models" CTA while unconfigured;
 * submitting a topic — or sending on /chat/new — opens THIS dialog with
 * the draft preserved; Save stores the slots — the draft WAITS in the
 * composer, the learner sends it themselves (owner ruling 2026-10-09:
 * saving models must never send the message).
 *
 * STAGED BY DEPENDENCY (owner, 2026-09-20: "first keys, then models —
 * there's no point presenting the model picker before the user has set a
 * key because there are no models to pick then"):
 *   Stage 1 — no keyed provider: a SELF-CONTAINED first-key screen
 *     (zero-keys wave, owner 2026-09-25): provider picker + one key
 *     input + save via PUT /api/keys/:id. The dialog STAYS MOUNTED —
 *     saving dispatches the "keys" signal, the fetch effect re-runs on
 *     it, and the stage flips to the pickers on its own. No Settings
 *     round-trip anymore; the draft lives in the caller's state,
 *     untouched throughout.
 *   Stage 2 — Strong → Cheap → Vision pickers over the FEDERATED catalog
 *     (keyed providers only), the vision slot filtered to image-capable
 *     models, in the app's shared dropdown language (ModelMenuList).
 *     All three required (owner: no skip, no defaults); Save PUTs the
 *     models section and reports onDone(models).
 *
 * Closable without configuring (Esc/backdrop/✕) — browsing the app stays
 * possible; the GATE is the send interception, not the dialog. The
 * settings-dialog visual language: dim backdrop, border rounded-md card,
 * CMU title, z-50.
 */

import { TextInput } from "@astryxdesign/core/TextInput";
import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { XIcon } from "lucide-react";
import type React from "react";
import { type ModelCatalogEntry, type ModelSlotName, type ModelsSettings } from "@/src/core";
import { prettyModel } from "@/components/usage-format";
import { ModelSelector, ProviderSelector, ThinkingSelector } from "@/components/settings/model-menu";
import { notifySettingsSaved, useSettingsSaved } from "@/components/settings-signal";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { hintText, TOOLTIP_DELAY_MS } from "@/lib/shortcut-hint";
import { OllamaRow, type OllamaInfo, type ProviderKeyInfo } from "@/components/settings/keys-section";
import { ChatGPTBackgroundAccess } from "@/components/settings/chatgpt-connection";
import { NativeSubscriptionBackgroundAccess, SubscriptionConnections } from "@/components/settings/subscription-connections";
import { defaultOrderLevel, populateLevel, THINKING_LABEL } from "@/components/thinking-default";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

/** The pickers' slot identity — same roster language as the Agent
 *  section's slot rows. */
const SLOT_META: Record<ModelSlotName, { label: string; roster: string }> = {
	strong: { label: "Strong", roster: "Prober, teacher" },
	cheap: { label: "Cheap", roster: "Researcher, demo builder, extractor, auditor" },
	vision: { label: "Vision", roster: "Visual maker + PDF reader" },
};
const SLOT_ORDER: readonly ModelSlotName[] = ["strong", "cheap", "vision"];

/** The GET /api/models response fields the flow consumes. */
interface ModelsBody {
	models: ModelCatalogEntry[];
	providers: { id: string; keyPresent: boolean }[];
	/** The three tiers' RESOLVED pins (BYOK: NULL per unset tier) — the
	 *  PREFILL + "needed" marks (owner, 2026-09-22): pinned tiers open
	 *  with their pick, unpinned tiers carry the mark. */
	slots?: Record<ModelSlotName, { model: { provider: string; id: string }; thinkingLevel?: ThinkingLevel } | null>;
}

/** Pure: which stage the flow opens at — no keyed provider = keys first
 *  (owner's dependency ordering). Exported for tests. */
export function setupStage(
	providers: { id: string; keyPresent: boolean }[] | null,
): "keys" | "pickers" {
	if (providers === null) return "keys"; // fetch failed → the honest fallback
	return providers.some((p) => p.keyPresent) ? "pickers" : "keys";
}

/** Prefill (owner, BYOK wave 2026-09-22): each pinned tier opens with its
 *  pick — matched in the FEDERATED catalog (a lapsed key's pin does not
 *  prefill); unpinned tiers stay empty and carry the "needed" mark.
 *  First-run = nothing pinned → all three empty + marked. Exported pure
 *  for tests. */
export function prefillFromSlots(
	models: ModelCatalogEntry[],
	slots: Record<ModelSlotName, { model: { provider: string; id: string } } | null> | undefined,
): Partial<Record<ModelSlotName, ModelCatalogEntry>> {
	const pre: Partial<Record<ModelSlotName, ModelCatalogEntry>> = {};
	for (const slot of SLOT_ORDER) {
		const pin = slots?.[slot];
		const entry = pin?.model
			? models.find((m) => m.provider === pin.model!.provider && m.id === pin.model!.id)
			: undefined;
		if (entry) pre[slot] = entry;
	}
	return pre;
}

/** Level prefill (chunk 2): a pinned tier opens with its STORED level
 *  as-is (Save clamps server-side if the ladder lapsed), else the
 *  ordering's level for that model — the level a fresh pick would
 *  populate (owner: the ordering's only purpose is first assignment).
 *  Exported pure for tests. */
export function prefillLevelFromPin(
	entry: ModelCatalogEntry,
	pin: { thinkingLevel?: ThinkingLevel } | null | undefined,
): ThinkingLevel {
	return populateLevel(pin?.thinkingLevel, entry.supportedLevels);
}

/** Stage 1's pure body — exported for SSR pins (the delete/settings
 *  body pattern). The wrapper owns state + effects + the portal.
 *
 * The first-key screen (owner, zero-keys wave): provider picker (the
 * app's shared dropdown language, ProviderMenuList), one paste input,
 * Save. A save that 400s keeps the line inline (the keys section's
 * shape-gates write user-facing error text). */
export function SetupKeysBody({
	providers,
	provider,
	value,
	saving,
	error,
	menuOpen,
	onToggleMenu,
	onPick,
	onValue,
	onSave,
	menuAnchor,
	ollama,
	onRecheckOllama,
	allProviders,
}: {
	/** The full provider roster (GET /api/keys providers) — undefined
	 *  while it loads; the picker renders an honest empty state then. */
	providers: ProviderKeyInfo[] | undefined;
	/** The chosen provider; null = the picker trigger reads "Pick a
	 *  provider…". */
	provider: ProviderKeyInfo | null;
	value: string;
	saving: boolean;
	error: string | null;
	menuOpen: boolean;
	onToggleMenu: () => void;
	onPick: (p: ProviderKeyInfo) => void;
	onValue: (v: string) => void;
	onSave: () => void;
	/** The MenuShell anchor — wired by the wrapper (its triggerRef). */
	menuAnchor: React.RefObject<HTMLDivElement | null>;
	/** Local Ollama status (GET /api/keys) — the no-key way in. */
	ollama?: OllamaInfo;
	onRecheckOllama?: () => void;
	/** AXIOM_ALL_PROVIDERS=1: also offer the subscriptions. */
	allProviders?: boolean;
}) {
	return (
		<div className="flex flex-col gap-3 px-6 py-5" data-testid="setup-stage-keys">
			<p className="text-xs text-secondary">
				Paste your Meta Model API key to use the Muse models, or run Ollama for local models with no key. You’ll pick your models next.
			</p>
			<div className="flex flex-col gap-2">
				<ProviderSelector
					label="Provider"
					testid="setup-key-provider"
					width={384}
					providers={providers ?? []}
					value={provider?.id}
					onChange={onPick}
				/>
				{provider && (
					<div className="flex max-w-96 items-center gap-2">
						<TextInput
							label={`${provider.label} key`}
							isLabelHidden
							size="sm"
							value={value}
							onChange={onValue}
							onKeyDown={(e) => {
								if (e.key === "Enter" && value.trim()) onSave();
							}}
							placeholder="Paste key…"
							data-testid="setup-key-input"
							isDisabled={saving}
							hasAutoFocus
							autoComplete="off"
							containerClassName="min-w-0 flex-1"
							controlClassName="font-mono"
						/>
						<Button size="sm" variant="primary" label="Save key" onClick={onSave} isDisabled={!value.trim()} isLoading={saving} data-testid="setup-key-save" />
					</div>
				)}
				{error && (
					<p role="alert" data-testid="setup-key-error" className="text-xs text-red-400">
						{error}
					</p>
				)}
			</div>
			<div className="mt-2 max-w-[28rem] border-t border-border/60 pt-4">
				<h3 className="mb-2 font-ui text-xs text-secondary">Local models</h3>
				<OllamaRow ollama={ollama} onRecheck={onRecheckOllama ?? (() => undefined)} />
			</div>
			{allProviders && <div className="mt-2 border-t border-border/60 pt-4"><h3 className="mb-3 font-ui text-xs text-secondary">Subscriptions</h3><SubscriptionConnections setup /></div>}
		</div>
	);
}

export function SetupDialog({
	open,
	onClose,
	/** Saved: the models section landed; the caller marks configured (the
	 *  draft stays put — save never sends). */
	onDone,
}: {
	open: boolean;
	onClose: () => void;
	onDone: (models: ModelsSettings) => void;
}) {
	const [body, setBody] = useState<ModelsBody | null>(null);
	const [failed, setFailed] = useState(false);
	const [picked, setPicked] = useState<Partial<Record<ModelSlotName, ModelCatalogEntry>>>({});
	/** Per-slot thinking level (chunk 2): populated from the ordering on
	 *  every fresh model pick, editable — an explicit pick always wins. */
	const [levels, setLevels] = useState<Partial<Record<ModelSlotName, ThinkingLevel>>>({});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [openMenu, setOpenMenu] = useState<{ slot: ModelSlotName; kind: "model" | "thinking" } | null>(null);
	// Stage 1's first-key screen (zero-keys wave): the provider roster,
	// the chosen provider + pasted value, its busy/error pair, and its own
	// menu-open bit (the slot menus' dismissal machinery covers it too —
	// see the trigger testid branch below).
	const [keyProviders, setKeyProviders] = useState<ProviderKeyInfo[] | undefined>(undefined);
	const [keyProvider, setKeyProvider] = useState<ProviderKeyInfo | null>(null);
	const [keyValue, setKeyValue] = useState("");
	const [keySaving, setKeySaving] = useState(false);
	const [keyError, setKeyError] = useState<string | null>(null);
	const [keyMenuOpen, setKeyMenuOpen] = useState(false);
	const [ollama, setOllama] = useState<OllamaInfo | undefined>(undefined);
	const [allProviders, setAllProviders] = useState(false);
	// Stage 1's provider-picker trigger wrapper — the shared shell's anchor.
	// Declared with the other hooks: the early `if (!open) return null` sits
	// below them all. (Stage 2's slot menus anchor by anchorTestid instead —
	// see the slot MenuShell below for why a ref cannot work there.)
	const keyTriggerRef = useRef<HTMLDivElement>(null);

	// The keys signal (zero-keys wave): keys-section saves/deletes AND
	// THIS dialog's own first-key save dispatch it; the fetch effect below
	// re-runs on it, so saving a key flips the stage to the pickers with
	// the widened catalog — no restart, no Settings round-trip.
	const [keysTick, setKeysTick] = useState(0);
	useSettingsSaved((section) => {
		if (section === "keys") setKeysTick((t) => t + 1);
	});

	// Fresh /api/models per open AND per keys change — a key saved a
	// moment ago (stage 1's own screen) widens the pickers immediately.
	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setBody(null);
		setPicked({});
		setLevels({});
		setError(null);
		fetch("/api/keys")
			.then((r) => r.json())
			.then((b: { providers?: ProviderKeyInfo[]; ollama?: OllamaInfo; allProviders?: boolean }) => {
				if (cancelled) return;
				setKeyProviders(b.providers ?? []);
				setOllama(b.ollama);
				setAllProviders(b.allProviders === true);
			})
			.catch(() => { if (!cancelled) setKeyProviders([]); });
		fetch("/api/models")
			.then((r) => { if (!r.ok) throw new Error("Catalog unavailable"); return r.json(); })
			.then((b: ModelsBody) => {
				if (cancelled) return;
				setBody(b);
				setFailed(false);
				// Prefill (owner, 2026-09-22): each pinned tier opens with its
				// pick (matched in the FEDERATED catalog — a lapsed key's pin
				// does not prefill); unpinned tiers stay empty and carry the
				// "needed" mark. First-run = nothing pinned → all three marked.
				const pre = prefillFromSlots(b.models, b.slots);
				setPicked(pre);
				// Levels prefill with the pins (chunk 2): stored level if still
				// supported, else the ordering's level for the pinned model.
				const preLevels: Partial<Record<ModelSlotName, ThinkingLevel>> = {};
				for (const slot of SLOT_ORDER) {
					const entry = pre[slot];
					if (entry) preLevels[slot] = prefillLevelFromPin(entry, b.slots?.[slot]);
				}
				setLevels(preLevels);
			})
			.catch(() => { if (!cancelled) setFailed(true); });
		return () => { cancelled = true; };
	}, [open, keysTick]);

	// Esc + outside-click — layered dismissal, closable WITHOUT
	// configuring (browsing stays possible; the gate is the send
	// interception, not this dialog). An open slot menu eats Esc first
	// (and any click outside it); only a bare Esc closes the dialog.
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			// THE ONE-ESC LAW (owner, keyboard round 2026-10-06): claim at
			// the document level before the layered dismissal — every branch
			// below acts, so the window chain (dictation → abort) must
			// never also fire. One Esc, one action.
			e.preventDefault();
			e.stopPropagation();
			if (keyMenuOpen) {
				setKeyMenuOpen(false);
				return;
			}
			if (openMenu !== null) setOpenMenu(null);
			else onClose();
		};
		const onPointerDown = (e: PointerEvent) => {
			if (!(e.target instanceof Element)) return;
			const t = e.target;
			if (keyMenuOpen) {
				if (t.closest("[data-lh-menu]") || t.closest('[data-testid="setup-key-provider"]')) return;
				setKeyMenuOpen(false);
			}
			if (openMenu === null) return;
			const triggerTestid =
				openMenu.kind === "model" ? `setup-trigger-${openMenu.slot}` : `setup-thinking-${openMenu.slot}`;
			if (t.closest("[data-lh-menu]") || t.closest(`[data-testid="${triggerTestid}"]`)) return;
			setOpenMenu(null);
		};
		document.addEventListener("keydown", onKey);
		document.addEventListener("pointerdown", onPointerDown);
		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("pointerdown", onPointerDown);
		};
	}, [open, onClose, openMenu, keyMenuOpen]);

	const stage = failed ? "keys" : setupStage(body ? body.providers : null);
	const allPicked = SLOT_ORDER.every((s) => picked[s]);

	/** Stage 1's save: PUT the pasted key, dispatch the keys signal, and
	 *  CLEAN the local screen — the signal re-fetch widens the catalog and
	 *  the stage flips to the pickers on its own; the dialog stays mounted
	 *  the whole way. Shape-gate 400s keep their user-facing line inline. */
	async function saveKey() {
		if (!keyProvider || !keyValue.trim() || keySaving) return;
		setKeySaving(true);
		setKeyError(null);
		const res = await fetch(`/api/keys/${encodeURIComponent(keyProvider.envVar)}`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ value: keyValue }),
		}).catch(() => null);
		setKeySaving(false);
		if (!res || !res.ok) {
			const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
			setKeyError(res ? (body?.error ?? `Save failed (${res.status})`) : "Save failed. Check your connection and try again.");
			return;
		}
		setKeyProvider(null);
		setKeyValue("");
		notifySettingsSaved("keys");
	}

	async function save() {
		if (!allPicked || saving) return;
		setSaving(true);
		setError(null);
		const models: ModelsSettings = {};
		for (const slot of SLOT_ORDER) {
			const level = levels[slot];
			models[slot] = {
				model: { provider: picked[slot]!.provider, id: picked[slot]!.id },
				...(level ? { thinkingLevel: level } : {}),
			};
		}
		const res = await fetch("/api/settings/models", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(models),
		}).catch(() => null);
		if (!res || !res.ok) {
			setSaving(false);
			setError(res ? `Save failed: ${(await res.json().catch(() => ({}))).error ?? res.status}` : "Save failed. Check your connection and try again.");
			return;
		}
		notifySettingsSaved("models");
		onDone(models);
	}

	return (
		<Dialog
			isOpen={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
			purpose="form"
			width={640}
			maxHeight="85dvh"
			padding={0}
		>
			{open && (
			<Layout
				data-testid="setup-dialog"
				header={
					<DialogHeader
						title="Set up your models"
						endContent={
							<Tooltip content={hintText("Close", undefined, "escape")} placement="start" delay={TOOLTIP_DELAY_MS} hasHoverIndication={false}>
								<IconButton label="Close setup" data-testid="setup-close" variant="ghost" icon={<XIcon className="size-4" />} onClick={onClose} />
							</Tooltip>
						}
					/>
				}
				content={
				<LayoutContent isScrollable>
				{stage === "keys" ? (
					<div className="flex flex-col px-6 py-5">
						{failed ? (
							<p className="text-sm text-primary">
								Model catalog could not be loaded. Check the connection and retry.
							</p>
						) : (
							<SetupKeysBody
								providers={keyProviders}
								provider={keyProvider}
								value={keyValue}
								saving={keySaving}
								error={keyError}
								menuOpen={keyMenuOpen}
								menuAnchor={keyTriggerRef}
								onToggleMenu={() => setKeyMenuOpen((v) => !v)}
								onPick={(p) => {
									setKeyProvider(p);
									setKeyMenuOpen(false);
									setKeyError(null);
								}}
								onValue={setKeyValue}
								onSave={() => void saveKey()}
								ollama={ollama}
								allProviders={allProviders}
								onRecheckOllama={() => {
									// Re-runs both fetches: a running Ollama moves setup on to the pickers.
									setOllama(undefined);
									setKeysTick((t) => t + 1);
								}}
							/>
						)}
					</div>
				) : (
					<div className="flex flex-col gap-4 overflow-y-auto px-6 py-5" data-testid="setup-stage-pickers">
						<p className="text-xs text-secondary">
							Pick the model for each tier. All three are required before chats can start.
						</p>
						{SLOT_ORDER.map((slot) => {
							const entry = picked[slot];
							const level = levels[slot];
							const levelsForEntry = entry?.supportedLevels ?? [];
							const catalog =
								slot === "vision" ? body?.models.filter((m) => m.input.includes("image")) : body?.models;
							return (
								<div key={slot} data-testid={`setup-slot-${slot}`} className="flex flex-col gap-1.5">
									<span className="flex items-center gap-1.5">
										<span className="font-ui text-sm text-primary">{SLOT_META[slot].label}</span>
										{!body?.slots?.[slot]?.model && !picked[slot] && (
											<span
												data-testid={`setup-needed-${slot}`}
												className="rounded-sm border border-border px-1 py-0.5 text-[10px] font-normal tracking-wide text-secondary"
											>
												needed
											</span>
										)}
									</span>
									<span className="text-xs text-secondary/70">{SLOT_META[slot].roster}</span>
									{slot !== "strong" && <><ChatGPTBackgroundAccess provider={entry?.provider} /><NativeSubscriptionBackgroundAccess provider={entry?.provider} /></>}
									<div className="flex items-center gap-2">
										<ModelSelector
											label={`${SLOT_META[slot].label} model`}
											testid={`setup-trigger-${slot}`}
											width="100%"
											models={catalog}
											value={entry}
											emptyText={catalog && catalog.length === 0 ? "No image-capable models. Add a provider key with access to a vision model." : undefined}
											onChange={(m) => {
												setPicked((prev) => ({ ...prev, [slot]: m }));
												// A fresh pick takes the model's default thinking level.
												setLevels((prev) => ({ ...prev, [slot]: populateLevel(prev[slot], m.supportedLevels) }));
											}}
										/>
										<ThinkingSelector
											label={`${SLOT_META[slot].label} thinking`}
											testid={`setup-thinking-${slot}`}
											width={128}
											levels={levelsForEntry.map(String)}
											value={level}
											format={(lv) => THINKING_LABEL[lv as ThinkingLevel] ?? lv}
											isDisabled={!entry}
											onChange={(lv) => setLevels((prev) => ({ ...prev, [slot]: lv as ThinkingLevel }))}
										/>
									</div>
								</div>
							);
						})}
						<div className="flex items-center gap-3">
							<Button
								data-testid="setup-save"
								label="Save models"
								variant="primary"
								isDisabled={!allPicked}
								isLoading={saving}
								onClick={() => void save()}
							/>
							{error && <p className="text-sm text-error">{error}</p>}
						</div>
					</div>
				)}
				</LayoutContent>
				}
			/>
			)}
		</Dialog>
	);
}
