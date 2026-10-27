/**
 * Settings → Anki: keep a deck of the knowledge graph in Anki and let the
 * tutor use your flashcard reviews. Talks to Anki through the AnkiConnect
 * add-on; the server does the syncing (engine server/anki.ts).
 */

import { useCallback, useEffect, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { ANKI_DEFAULT_DECK, ANKI_DEFAULT_URL, type AnkiSettings } from "@/src/core";
import { notifySettingsSaved } from "@/components/settings-signal";
import { CommitInput, SettingsGroup, SettingsRow, Toggle } from "./controls.tsx";

interface AnkiSyncResult {
	at: number;
	ok: boolean;
	added?: number;
	updated?: number;
	cards?: number;
	reviews?: number;
	error?: string;
}

interface AnkiStatus {
	enabled: boolean;
	connected: boolean;
	error?: string;
	lastSync?: AnkiSyncResult;
	cards: number;
}

const ANKI_CONNECT_CODE = "2055492159";

function ago(at: number): string {
	const min = Math.round((Date.now() - at) / 60_000);
	if (min < 1) return "just now";
	if (min < 60) return `${min} min ago`;
	const h = Math.round(min / 60);
	if (h < 24) return `${h} h ago`;
	return new Date(at).toLocaleDateString();
}

function syncSummary(r: AnkiSyncResult): string {
	if (!r.ok) return `Last sync failed ${ago(r.at)}: ${r.error ?? "unknown error"}`;
	const changes = [r.added ? `${r.added} added` : "", r.updated ? `${r.updated} updated` : ""].filter(Boolean);
	return `Synced ${ago(r.at)}${changes.length ? ` · ${changes.join(", ")}` : ""} · ${r.reviews ?? 0} reviews read from ${r.cards ?? 0} cards`;
}

export function AnkiSection({
	anki,
	onSave,
}: {
	anki: AnkiSettings | undefined;
	/** Mirror the stored section into the dialog's record. */
	onSave: (next: AnkiSettings) => void;
}) {
	const [settings, setSettings] = useState<AnkiSettings>(anki ?? {});
	const [status, setStatus] = useState<AnkiStatus | null>(null);
	const [syncing, setSyncing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		const res = await fetch("/api/anki").catch(() => null);
		if (res?.ok) setStatus((await res.json()) as AnkiStatus);
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const persist = async (next: AnkiSettings) => {
		setError(null);
		const res = await fetch("/api/settings/anki", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(next),
		});
		if (!res.ok) {
			const detail = (await res.json().catch(() => ({}))) as { error?: string };
			setError(detail.error ?? `Couldn't save (${res.status})`);
			return false;
		}
		setSettings(next);
		onSave(next);
		notifySettingsSaved("anki");
		return true;
	};

	const syncNow = async () => {
		setSyncing(true);
		setError(null);
		const res = await fetch("/api/anki/sync", { method: "POST" }).catch(() => null);
		const body = (await res?.json().catch(() => null)) as AnkiSyncResult | { error?: string } | null;
		if (!res?.ok) setError(body?.error ?? "Sync failed");
		setSyncing(false);
		void refresh();
	};

	const enabled = settings.enabled === true;

	return (
		<VStack data-testid="anki-section">
			<SettingsGroup label="Sync">
				<SettingsRow
					label="Sync with Anki"
					hint="After each session, your knowledge map is copied into an Anki deck, one card per idea. Before each new session, your Anki reviews are read so the tutor knows what you're forgetting."
				>
					<Toggle
						label="Sync with Anki"
						checked={enabled}
						onChange={async (next) => {
							if ((await persist({ ...settings, enabled: next })) && next) void syncNow();
						}}
					/>
				</SettingsRow>
				<SettingsRow label="Deck" hint="New cards go here. Cards you move to another deck stay where you put them." dimmed={!enabled}>
					<CommitInput
						ariaLabel="Deck"
						testid="anki-deck"
						value={settings.deck ?? ""}
						placeholder={ANKI_DEFAULT_DECK}
						onCommit={(deck) => void persist({ ...settings, deck: deck || undefined })}
					/>
				</SettingsRow>
				<SettingsRow label="AnkiConnect address" dimmed={!enabled}>
					<CommitInput
						ariaLabel="AnkiConnect address"
						testid="anki-url"
						value={settings.url ?? ""}
						placeholder={ANKI_DEFAULT_URL}
						onCommit={(url) => void persist({ ...settings, url: url || undefined })}
					/>
				</SettingsRow>
				<SettingsRow
					label="Status"
					testid="anki-status"
					hint={
						status === null
							? "Checking…"
							: status.connected
								? status.lastSync
									? syncSummary(status.lastSync)
									: "Anki is open and AnkiConnect is answering."
								: (status.error ?? "Anki isn't reachable.")
					}
				>
					<Button
						label="Sync now"
						size="sm"
						variant="secondary"
						data-testid="anki-sync"
						isLoading={syncing}
						isDisabled={!enabled}
						onClick={() => void syncNow()}
					/>
				</SettingsRow>
			</SettingsGroup>
			{error && <Banner status="error" title="Anki" description={error} />}
			<SettingsGroup label="Setup">
				<VStack gap={2} paddingBlockStart={2}>
					<Text type="supporting">
						1. In Anki, open Tools → Add-ons → Get Add-ons and enter the code {ANKI_CONNECT_CODE} (AnkiConnect). Restart Anki.
					</Text>
					<Text type="supporting">2. Keep Anki open while you study here. If it's closed, the last reviews read are used and the deck catches up next time.</Text>
					<Text type="supporting">
						Edits you make to a card in Anki are kept until the idea itself changes in your knowledge map. Cards you delete in Anki are not added back.
					</Text>
				</VStack>
			</SettingsGroup>
		</VStack>
	);
}
