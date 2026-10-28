/**
 * The Keys section (wave-5 polish, 2026-09-21 — owner design): a MINIMAL
 * key-value table. Provider left, masked key right, no description hints
 * (they took too much space), the "Get a key ↗" link a tiny muted guest.
 * Clicking a writable row unfolds a paste field + Save (+ Delete for a
 * file-sourced value) beneath it; Esc or a second click folds it away.
 * The Add-provider control is the LAST ROW of the table and uses the
 * app's shared dropdown look (ProviderMenuList — fuzzy search over the
 * 33 pi-ai providers).
 *
 * Owner rulings carried in:
 *  - Env-owned rows (a real environment variable owns the name — dev
 *    .env.local or launch env) render READ-ONLY + dimmed, no paste field:
 *    a paste box on a key the UI cannot make live would mislead.
 *  - OpenRouter is NOT special: one provider among 33, a row only when
 *    stored, otherwise it lives in the Add dropdown like everyone else.
 *  - Providers groups API keys, subscriptions, dictation and search.
 *    Unknown variables stay masked/read-only at the end of Model API keys.
 *
 * API: GET /api/keys (masked statuses + the providers array), PUT
 * /api/keys/:id (shape-gated 400s land inline), DELETE. Saves take
 * effect immediately. Plaintext never returns from the store.
 */

import { Text } from "@astryxdesign/core/Text";
import { List, ListItem } from "@astryxdesign/core/List";
import { Link } from "@astryxdesign/core/Link";
import { HStack } from "@astryxdesign/core/HStack";
import { Banner } from "@astryxdesign/core/Banner";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { useEffect, useRef, useState } from "react";
import { AUTH_KEYS, type AuthKeyStatus } from "@/src/core";
import { SettingsGroup } from "./controls.tsx";
import { SubscriptionConnections } from "./subscription-connections.tsx";
import { ProviderSelector } from "./model-menu.tsx";
import { notifySettingsSaved } from "@/components/settings-signal";

/** One pi-ai provider with plain API-key auth (the Platform seam —
 *  derived from pi-ai's own env-key table; no drift possible). */
export interface ProviderKeyInfo {
	id: string;
	envVar: string;
	label: string;
}

/** The local Ollama server as GET /api/keys reports it. */
export interface OllamaInfo {
	host: string;
	running: boolean;
	/** Tool-capable models Axiom can use. */
	models: string[];
	/** Pulled models that can't call tools, so they aren't offered. */
	skipped: string[];
}

interface KeysResponse {
	keys: AuthKeyStatus[];
	providers?: ProviderKeyInfo[];
	ollama?: OllamaInfo;
	/** AXIOM_ALL_PROVIDERS=1: show every provider and the subscriptions. */
	allProviders?: boolean;
}

/** Local models through Ollama: no key, just a running server. */
export function OllamaRow({ ollama, onRecheck }: { ollama: OllamaInfo | undefined; onRecheck: () => void }) {
	const usable = ollama?.running && ollama.models.length > 0;
	const status = !ollama
		? "Checking…"
		: usable
			? `Running · ${ollama.models.length} model${ollama.models.length === 1 ? "" : "s"}`
			: ollama.running
				? "Running · no models that support tools"
				: "Not running";
	return (
		<List density="compact" edge="flush">
			<ListItem
				data-testid="ollama-row"
				label="Ollama (local, no key)"
				description={
					ollama && !usable ? (
						<span data-testid="ollama-help">
							Install Ollama from ollama.com, then run <code>ollama pull llama3.1</code>. Kapany looks for it at{" "}
							<code>{ollama.host}</code>.
						</span>
					) : usable && ollama.skipped.length > 0 ? (
						<span data-testid="ollama-skipped">Not shown (no tool support): {ollama.skipped.join(", ")}</span>
					) : undefined
				}
				endContent={
					<HStack gap={3} align="center">
						<Text type="supporting" color={usable ? "primary" : "secondary"} data-testid="ollama-status">
							{status}
						</Text>
						<Button variant="secondary" size="sm" label="Check again" onClick={onRecheck} data-testid="ollama-recheck" />
					</HStack>
				}
			/>
		</List>
	);
}

/** The curated tools group, pinned by id (the catalog owns the copy;
 *  these ids are the contract). Derived from the catalog (search wave,
 *  2026-09-20: the Google CSE pair retired, Tavily + Brave joined) — the
 *  section can never drift from core/auth-keys.ts again. */
const TOOL_IDS = AUTH_KEYS.map((k) => k.id) as readonly string[];

/** The classification driving the table groups. Pure — exported for
 *  tests. OpenRouter is un-pinned (wave-5 owner ruling): no synthesis,
 *  no special row — it rides the same provider classification. */
export function classifyKeys(
	statuses: readonly AuthKeyStatus[],
	providers: readonly ProviderKeyInfo[] | undefined,
): {
	/** Stored provider keys (env or file), in GET order. */
	providerRows: AuthKeyStatus[];
	/** The curated tools rows (synthesized when absent — always shown,
	 *  they carry the docs links a first boot needs). */
	toolRows: AuthKeyStatus[];
	/** Unknown file vars — preserved, read-only. */
	unknownRows: AuthKeyStatus[];
	/** Providers without a stored key — the Add dropdown's options. */
	addable: ProviderKeyInfo[];
} {
	const byId = new Map(statuses.map((s) => [s.id, s]));
	const isTool = (id: string) => (TOOL_IDS as readonly string[]).includes(id);
	const providerEnv = new Set((providers ?? []).map((p) => p.envVar));
	const synth = (id: string): AuthKeyStatus => ({
		id,
		info: null,
		present: false,
		masked: null,
		source: "none",
		shadowedByEnv: false,
	});
	const providerRows: AuthKeyStatus[] = [];
	const unknownRows: AuthKeyStatus[] = [];
	for (const s of statuses) {
		if (isTool(s.id)) continue;
		if (providerEnv.has(s.id) || (!s.info && providers === undefined)) providerRows.push(s);
		else if (!s.info) unknownRows.push(s);
		// (pre-interlude catalogs: a curated-but-unclassified status still
		// renders as a provider row so nothing disappears)
		else providerRows.push(s);
	}
	return {
		providerRows,
		toolRows: TOOL_IDS.map((id) => byId.get(id) ?? synth(id)),
		unknownRows,
		addable: (providers ?? []).filter((p) => !byId.has(p.envVar)),
	};
}

/** The minimal status line, e.g. "…ab12 · 64 chars" (" · env" marks an
 *  environment-owned value — the row itself is read-only then). Pure. */
export function keyStatusLine(status: AuthKeyStatus): string {
	if (!status.present || !status.masked) return "not set";
	const tail = status.masked.replace(/ \((\d+) chars\)$/, "");
	const chars = status.masked.match(/\((\d+) chars\)$/)?.[1] ?? "?";
	return `${tail} · ${chars}${status.source === "env" ? " · env" : ""}`;
}

/** One table row: label left, tiny docs link + status right. Writable
 *  rows click-unfold an editor beneath (owner interaction); env-owned
 *  rows are dimmed and read-only (a paste box there would mislead). */
function KeyTableRow({
	label,
	docsUrl,
	status,
	expanded,
	onToggle,
	onSave,
	onDelete,
	onCancel,
	testid,
}: {
	label: string;
	/** The "Get a key ↗" target — curated keys carry one. */
	docsUrl?: string;
	status: AuthKeyStatus;
	expanded: boolean;
	onToggle: () => void;
	onSave: (value: string) => Promise<string | null>;
	onDelete?: () => Promise<void>;
	/** Folds the editor (owner, fix wave: the way OUT of a paste prompt
	 *  must be visible — Cancel beside Save/Delete, not only Esc). */
	onCancel: () => void;
	testid: string;
}) {
	const envOwned = status.source === "env";
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function save() {
		if (!value.trim() || busy) return;
		setBusy(true);
		setError(null);
		const err = await onSave(value);
		if (err) setError(err);
		else setValue("");
		setBusy(false);
	}

	// INLINE editing (owner, fix wave: "type the keys in line — more
	// table-like"): the expanded row becomes the editor itself — label
	// left, the paste field filling the middle, Save | Cancel (| Delete)
	// right — instead of a second line beneath the row.
	if (expanded && !envOwned) {
		return (
			<ListItem
				data-testid={`${testid}-editor`}
				label={label}
				description={error ? <Banner status="error" title={error} collapsible={false} data-testid={`${testid}-error`} /> : undefined}
				endContent={
					<HStack gap={2} align="center" className="min-w-0 flex-1">
					<TextInput
							label={`${label} key`}
							isLabelHidden
							size="sm"
							value={value}
							onChange={setValue}
							onKeyDown={(e) => {
								if (e.key === "Enter") void save();
							}}
							placeholder="Paste key…"
							data-testid={`${testid}-input`}
							isDisabled={busy}
							hasAutoFocus
							autoComplete="off"
							containerClassName="min-w-0 flex-1"
							controlClassName="font-mono"
						/>
						<Button variant="ghost" size="sm" label="Save" isDisabled={busy || !value.trim()} onClick={() => void save()} data-testid={`${testid}-save`} />
						<Button variant="ghost" size="sm" label="Cancel" isDisabled={busy} onClick={onCancel} data-testid={`${testid}-cancel`} />
						{status.present && status.source === "file" && onDelete && (
							<Button variant="ghost" size="sm" label="Delete" isDisabled={busy} onClick={() => void onDelete()} data-testid={`${testid}-delete`} />
						)}
					</HStack>
				}
			/>
		);
	}

	return (
			<ListItem
				data-testid={`${testid}-row`}
				description={error ? <Banner status="error" title={error} collapsible={false} data-testid={`${testid}-error`} /> : undefined}
				label={label}
				isDisabled={envOwned}
				onClick={() => !envOwned && onToggle()}
				endContent={
					<HStack gap={2} align="center">
						{docsUrl && (
							<Text type="supporting">
								<Link href={docsUrl} target="_blank">
									Get a key ↗
								</Link>
							</Text>
						)}
						<Text type="supporting" data-testid={`${testid}-status`}>
							{keyStatusLine(status)}
						</Text>
					</HStack>
				}
			/>
	);
}

/** The Add-provider control — the table's last row: a searchable
 *  Astryx Selector of providers without a key yet. */
function AddProviderRow({
	addable,
	onPick,
}: {
	addable: ProviderKeyInfo[];
	onPick: (p: ProviderKeyInfo) => void;
}) {
	const byId = new Map(addable.map((p) => [p.id, p]));
	return (
		<ProviderSelector
			label="Add provider key"
			testid="add-provider"
			placeholder={`Add provider key${addable.length ? ` (${addable.length})` : ""}`}
			width="100%"
			providers={addable}
			value={undefined}
			onChange={(p) => {
				const full = byId.get(p.id);
				if (full) onPick(full);
			}}
		/>
	);
}

export function KeysSection({
	/** A deep-linked row to unfold on arrival (zero-keys wave): the
	 *  dictation error's click lands here on DEEPGRAM_API_KEY. Followed
	 *  while mounted too — the settings dialog's while-open retarget
	 *  pattern. undefined = nothing seeded. */
	initialRow,
}: {
	initialRow?: string;
}) {
	const [statuses, setStatuses] = useState<AuthKeyStatus[] | null>(null);
	const [providers, setProviders] = useState<ProviderKeyInfo[] | undefined>(undefined);
	const [ollama, setOllama] = useState<OllamaInfo | undefined>(undefined);
	const [allProviders, setAllProviders] = useState(false);
	const [loading, setLoading] = useState(true);
	/** The unfolded row (its id), null = all folded. Seeded by the
	 *  deep-link (initialRow) and re-followed when it retargets. */
	const [openRow, setOpenRow] = useState<string | null>(initialRow ?? null);
	/** The paste editor for a freshly chosen Add-provider target. */
	const [adding, setAdding] = useState<ProviderKeyInfo | null>(null);
	const [addError, setAddError] = useState<string | null>(null);

	// Escape folds any open editor (unfolded row or the Add-provider paste)
	// WITHOUT closing the dialog. Claimed at document CAPTURE phase — the
	// only stopPropagation that outruns both the input's React handler and
	// the dialog's window-level listener.
	useEffect(() => {
		if (openRow === null && adding === null) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			e.preventDefault();
			e.stopPropagation();
			setOpenRow(null);
			setAdding(null);
		};
		document.addEventListener("keydown", onKeyDown, true);
		return () => document.removeEventListener("keydown", onKeyDown, true);
	}, [openRow, adding]);

	const reload = () =>
		fetch("/api/keys")
			.then((r) => r.json())
			.then((body: KeysResponse) => {
				setStatuses(body.keys ?? []);
				if (body.providers) setProviders(body.providers);
				setOllama(body.ollama);
				setAllProviders(body.allProviders === true);
			})
			.catch(() => setStatuses([]))
			.finally(() => setLoading(false));

	useEffect(() => {
		void reload();
	}, []);

	// The deep-link follow: a retarget while the section is open (the
	// same while-open pattern the dialog's section nav uses) unfolds the
	// named row; a fresh mount seeds it via the useState initializer.
	useEffect(() => {
		if (initialRow !== undefined) setOpenRow(initialRow);
	}, [initialRow]);

	async function saveKey(id: string, value: string): Promise<string | null> {
		const res = await fetch(`/api/keys/${id}`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ value }),
		});
		if (!res.ok) {
			const body = (await res.json().catch(() => ({}))) as { error?: string };
			return body.error ?? `Save failed (${res.status})`;
		}
		await reload();
		// The cross-surface keys signal (zero-keys wave): the zero-keys pill,
		// the setup dialog's stage advance, and any other keys reader hear
		// that a key landed — deletions included (see deleteKey below).
		notifySettingsSaved("keys");
		return null;
	}

	async function deleteKey(id: string): Promise<void> {
		await fetch(`/api/keys/${id}`, { method: "DELETE" }).catch(() => undefined);
		await reload();
		notifySettingsSaved("keys");
	}

	if (loading || statuses === null) {
		return <p className="px-6 py-5 text-xs text-secondary/70">Loading keys…</p>;
	}

	const { providerRows, toolRows, unknownRows, addable } = classifyKeys(statuses, providers);

	async function saveNewProvider(p: ProviderKeyInfo, value: string) {
		const err = await saveKey(p.envVar, value);
		if (err) setAddError(err);
		else {
			setAdding(null);
			setAddError(null);
		}
	}

	return (
		<>
			<SettingsGroup label="Model API keys" testid="group-provider-keys">
				<List density="compact" edge="flush" hasDividers>
				{providerRows.map((status) => (
					<KeyTableRow
						key={status.id}
						label={providers?.find((p) => p.envVar === status.id)?.label ?? status.info?.label ?? status.id}
						docsUrl={status.info?.docsUrl}
						status={status}
						expanded={openRow === status.id}
						onToggle={() => setOpenRow(openRow === status.id ? null : status.id)}
						onSave={async (v) => {
							const err = await saveKey(status.id, v);
							if (!err) setOpenRow(null); // fold on success — rest state
							return err;
						}}
						onCancel={() => setOpenRow(null)}
						onDelete={() => deleteKey(status.id)}
						testid={`key-${status.id.toLowerCase()}`}
					/>
				))}
				{unknownRows.map((status) => (
					<ListItem key={status.id} data-testid={`unknown-${status.id}`} label={status.id} isDisabled endContent={<Text type="supporting">{status.masked}</Text>} />
				))}
				</List>
				{/* Hidden once every offered provider has a key (by default just Meta). */}
				{providers !== undefined && addable.length > 0 && (
					<AddProviderRow
						addable={addable}
						onPick={(p) => {
							setAdding(p);
							setAddError(null);
						}}
					/>
				)}
				{adding && (
					<div className="flex items-center gap-2 rounded-sm px-1 py-1.5" data-testid={`key-${adding.id}-editor`}>
						<span className="shrink-0 font-ui text-xs text-primary">{adding.label}</span>
						<AddProviderEditor provider={adding} onSave={(v) => void saveNewProvider(adding, v)} onCancel={() => setAdding(null)} error={addError} />
					</div>
				)}
			</SettingsGroup>

			<SettingsGroup label="Local models" testid="group-local-models">
				<OllamaRow
					ollama={ollama}
					onRecheck={() => {
						setOllama(undefined);
						// Re-fetch, then tell the model pickers the catalog may have changed.
						void reload().then(() => notifySettingsSaved("keys"));
					}}
				/>
			</SettingsGroup>

			{allProviders && (
				<SettingsGroup label="Subscriptions" testid="group-subscriptions">
					<SubscriptionConnections />
				</SettingsGroup>
			)}

			<SettingsGroup label="Dictation" testid="group-dictation">
				<List density="compact" edge="flush">
					<ListItem data-testid="dictation-engine" label="Muse Voice Transcribe (Meta)" endContent={<Text type="supporting">uses your Meta key</Text>} />
				</List>
			</SettingsGroup>

			{(["Search"] as const).map((label) => <SettingsGroup key={label} label={label} testid="group-search">
				<List density="compact" edge="flush" hasDividers>
				{toolRows.filter((status) => status.id !== "DEEPGRAM_API_KEY").map((status) => (
					<KeyTableRow
						key={status.id}
						label={status.info?.label ?? status.id}
						docsUrl={status.info?.docsUrl}
						status={status}
						expanded={openRow === status.id}
						onToggle={() => setOpenRow(openRow === status.id ? null : status.id)}
						onSave={async (v) => {
							const err = await saveKey(status.id, v);
							if (!err) setOpenRow(null);
							return err;
						}}
						onCancel={() => setOpenRow(null)}
						onDelete={() => deleteKey(status.id)}
						testid={`key-${status.id.toLowerCase()}`}
					/>
				))}
				</List>
			</SettingsGroup>)}

		</>
	);
}

/** The paste field for a provider chosen in the Add dropdown — rendered
 *  beneath the Add row until saved or cancelled. */
function AddProviderEditor({
	provider,
	onSave,
	onCancel,
	error,
}: {
	provider: ProviderKeyInfo;
	onSave: (value: string) => void;
	onCancel: () => void;
	error: string | null;
}) {
	const [value, setValue] = useState("");
	return (
		<>
			<TextInput
				label={`${provider.label} key`}
				isLabelHidden
				size="sm"
				value={value}
				onChange={setValue}
				onKeyDown={(e) => {
					if (e.key === "Enter" && value.trim()) onSave(value);
				}}
				placeholder="Paste key…"
				data-testid={`key-${provider.id}-input`}
				hasAutoFocus
				autoComplete="off"
				containerClassName="min-w-0 flex-1"
				controlClassName="font-mono"
			/>
			<Button variant="ghost" size="sm" label="Save" isDisabled={!value.trim()} onClick={() => value.trim() && onSave(value)} data-testid={`key-${provider.id}-save`} />
			<Button variant="ghost" size="sm" label="Cancel" onClick={onCancel} data-testid={`key-${provider.id}-cancel`} />
			{error && (
				<Banner status="error" title={error} collapsible={false} data-testid={`key-${provider.id}-error`} />
			)}
		</>
	);
}
