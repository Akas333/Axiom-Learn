/**
 * Settings → Your data (2026-10-30): move everything to another computer.
 * Export saves one encrypted .tysa file (lessons, knowledge graph,
 * materials, settings); import on the other computer replaces its data with
 * the file's, keeping what was there in a backup. Provider keys never go in
 * the file. Server side: engine server/data-transfer.ts.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsRow } from "./controls.tsx";

const MIN_PASSPHRASE = 8;

interface Summary {
	files: number;
	bytes: number;
	chats: number;
	materials: number;
}

type Status = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "error"; text: string } | { kind: "done"; text: string };

function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
	return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function plural(n: number, word: string): string {
	return `${n} ${word}${n === 1 ? "" : "s"}`;
}

async function errorOf(res: Response): Promise<string> {
	const body = (await res.json().catch(() => ({}))) as { error?: string };
	return body.error ?? `Request failed (${res.status}).`;
}

/** A settings row's label and hint, for rows whose controls sit below. */
function RowHeading({ label, hint }: { label: string; hint: string }) {
	return (
		<div className="pt-4 pb-3">
			<span className="block text-[15px] text-foreground">{label}</span>
			<span className="mt-1 block max-w-[62ch] text-sm leading-relaxed text-muted-foreground">{hint}</span>
		</div>
	);
}

function StatusLine({ status, testid }: { status: Status; testid: string }) {
	if (status.kind === "idle") return null;
	return (
		<p
			role={status.kind === "error" ? "alert" : "status"}
			data-testid={testid}
			className={status.kind === "error" ? "pb-3 text-sm text-destructive" : "pb-3 text-sm text-muted-foreground"}
		>
			{status.text}
		</p>
	);
}

export function DataSection() {
	const [summary, setSummary] = useState<Summary | null>(null);

	useEffect(() => {
		fetch("/api/data", { cache: "no-store" })
			.then((res) => (res.ok ? (res.json() as Promise<Summary>) : null))
			.then(setSummary)
			.catch(() => setSummary(null));
	}, []);

	return (
		<>
			<SettingsRow
				label="On this computer"
				hint="Everything stays here. Nothing is uploaded anywhere."
				testid="row-data-summary"
			>
				<span className="text-sm text-muted-foreground" data-testid="data-summary">
					{summary
						? `${plural(summary.chats, "lesson")} · ${plural(summary.materials, "material")} · ${formatBytes(summary.bytes)}`
						: "…"}
				</span>
			</SettingsRow>
			<ExportRow />
			<ImportRow />
		</>
	);
}

function ExportRow() {
	const [passphrase, setPassphrase] = useState("");
	const [confirm, setConfirm] = useState("");
	const [status, setStatus] = useState<Status>({ kind: "idle" });
	const busy = status.kind === "busy";
	const mismatch = confirm.length > 0 && confirm !== passphrase;
	const ready = passphrase.length >= MIN_PASSPHRASE && confirm === passphrase && !busy;

	async function exportData() {
		setStatus({ kind: "busy", text: "Encrypting…" });
		try {
			const res = await fetch("/api/data/export", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ passphrase }),
			});
			if (!res.ok) return setStatus({ kind: "error", text: await errorOf(res) });
			const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "tysa-data.tysa";
			const url = URL.createObjectURL(await res.blob());
			const a = document.createElement("a");
			a.href = url;
			a.download = name;
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 10_000);
			setPassphrase("");
			setConfirm("");
			setStatus({ kind: "done", text: `Saved ${name}. You'll need the passphrase to open it.` });
		} catch {
			setStatus({ kind: "error", text: "Couldn't reach the TYSA server." });
		}
	}

	return (
		<div className="border-b border-border/60 last:border-b-0" data-testid="row-data-export">
			<RowHeading
				label="Export"
				hint={`Saves one encrypted file to carry to another computer. API keys aren't included. If you lose the passphrase, the file can't be opened. Use at least ${MIN_PASSPHRASE} characters.`}
			/>
			<form
				className="flex flex-wrap items-center gap-2 pb-4"
				onSubmit={(e) => {
					e.preventDefault();
					if (ready) void exportData();
				}}
			>
				<Input
					type="password"
					autoComplete="new-password"
					placeholder="Passphrase"
					aria-label="Export passphrase"
					data-testid="export-passphrase"
					className="w-auto min-w-0 flex-1 basis-44"
					value={passphrase}
					onChange={(e) => setPassphrase(e.target.value)}
				/>
				<Input
					type="password"
					autoComplete="new-password"
					placeholder="Repeat passphrase"
					aria-label="Repeat export passphrase"
					aria-invalid={mismatch || undefined}
					data-testid="export-passphrase-confirm"
					className="w-auto min-w-0 flex-1 basis-44"
					value={confirm}
					onChange={(e) => setConfirm(e.target.value)}
				/>
				<Button type="submit" size="sm" disabled={!ready} data-testid="export-data">
					Export
				</Button>
			</form>
			{mismatch && <p className="pb-3 text-sm text-destructive">The passphrases don't match.</p>}
			<StatusLine status={status} testid="export-status" />
		</div>
	);
}

function ImportRow() {
	const fileInput = useRef<HTMLInputElement>(null);
	const [file, setFile] = useState<File | null>(null);
	const [passphrase, setPassphrase] = useState("");
	const [confirming, setConfirming] = useState(false);
	const [status, setStatus] = useState<Status>({ kind: "idle" });
	const busy = status.kind === "busy";
	const ready = file !== null && passphrase.length > 0 && !busy;

	async function importData() {
		if (!file) return;
		setConfirming(false);
		setStatus({ kind: "busy", text: "Decrypting and importing…" });
		const form = new FormData();
		form.set("file", file);
		form.set("passphrase", passphrase);
		try {
			const res = await fetch("/api/data/import", { method: "POST", body: form });
			if (!res.ok) return setStatus({ kind: "error", text: await errorOf(res) });
			const result = (await res.json()) as Summary & { backup: string | null };
			setPassphrase("");
			setStatus({
				kind: "done",
				text:
					`Imported ${plural(result.chats, "lesson")} and ${plural(result.materials, "material")}.` +
					(result.backup ? ` Your previous data is in data/${result.backup}.` : "") +
					" Reloading…",
			});
			setTimeout(() => window.location.reload(), 1500);
		} catch {
			setStatus({ kind: "error", text: "Couldn't reach the TYSA server." });
		}
	}

	return (
		<div data-testid="row-data-import">
			<RowHeading
				label="Import"
				hint="Replaces the data on this computer with a .tysa file's. What's here now is kept in a backup folder first."
			/>
			<form
				className="flex flex-wrap items-center gap-2 pb-4"
				onSubmit={(e) => {
					e.preventDefault();
					if (ready) setConfirming(true);
				}}
			>
				<input
					ref={fileInput}
					type="file"
					accept=".tysa,.kapany"
					className="hidden"
					data-testid="import-file"
					onChange={(e) => {
						setFile(e.target.files?.[0] ?? null);
						setConfirming(false);
						setStatus({ kind: "idle" });
					}}
				/>
				<Button type="button" variant="outline" size="sm" className="max-w-56" onClick={() => fileInput.current?.click()}>
					<span className="truncate">{file ? file.name : "Choose file…"}</span>
				</Button>
				<Input
					type="password"
					autoComplete="off"
					placeholder="Passphrase"
					aria-label="Import passphrase"
					data-testid="import-passphrase"
					className="w-auto min-w-0 flex-1 basis-44"
					value={passphrase}
					onChange={(e) => {
						setPassphrase(e.target.value);
						setConfirming(false);
					}}
				/>
				<Button type="submit" size="sm" variant="outline" disabled={!ready || confirming} data-testid="import-data">
					Import
				</Button>
			</form>
			{confirming && (
				<div className="flex flex-wrap items-center gap-2 pb-4" data-testid="import-confirm">
					<span className="text-sm text-foreground">Replace this computer's data with the file's?</span>
					<Button size="sm" variant="destructive" onClick={() => void importData()} data-testid="import-confirm-replace">
						Replace
					</Button>
					<Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
						Cancel
					</Button>
				</div>
			)}
			<StatusLine status={status} testid="import-status" />
		</div>
	);
}
