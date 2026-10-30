/**
 * Settings → Account (hosted app only): who is signed in, the plan and this
 * month's lessons on Kapany's keys, upgrade / manage billing, sign out.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { notifySettingsSaved } from "@/components/settings-signal";
import { CommitInput, SettingsGroup, SettingsRow } from "./controls.tsx";

interface Profile {
	display_name: string | null;
	avatar_url: string | null;
}

interface Me {
	email: string | null;
	profile: Profile | null;
	billing: boolean;
	quota: { plan: "free" | "pro"; ownKeys: boolean; used: number; limit: number; remaining: number };
}

export function AccountSection() {
	const { email, signOut } = useAuth();
	const [me, setMe] = useState<Me | null>(null);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		fetch("/api/me", { cache: "no-store" })
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
			.then(setMe)
			.catch(() => setError("Couldn't load your account."));
	}, []);

	/** Save one profile field; the stored row comes back and replaces ours. */
	const saveProfile = async (edit: Partial<Profile>) => {
		setError("");
		const res = await fetch("/api/profile", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(edit),
		});
		const body = (await res.json().catch(() => ({}))) as { profile?: Profile; error?: string };
		if (!res.ok || !body.profile) return setError(body.error ?? "Couldn't save your profile.");
		setMe((prev) => (prev ? { ...prev, profile: body.profile ?? prev.profile } : prev));
		// The sidebar's account row re-reads.
		notifySettingsSaved("profile");
	};

	const goToBilling = async (endpoint: "checkout" | "portal") => {
		setError("");
		setBusy(true);
		const res = await fetch(`/api/billing/${endpoint}`, { method: "POST" });
		const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
		setBusy(false);
		if (body.url) window.location.assign(body.url);
		else setError(body.error ?? "Billing is unavailable right now.");
	};

	const quota = me?.quota;
	return (
		<>
			{error && (
				<div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm">
					{error}
				</div>
			)}
			<SettingsGroup label="Profile">
				<SettingsRow label="Picture" hint="Shown in the app. Paste an https:// image link.">
					<Avatar src={me?.profile?.avatar_url} name={me?.profile?.display_name ?? email} />
				</SettingsRow>
				<SettingsRow label="Name">
					<CommitInput
						value={me?.profile?.display_name ?? ""}
						placeholder="Your name"
						ariaLabel="Your name"
						onCommit={(next) => void saveProfile({ display_name: next || null })}
					/>
				</SettingsRow>
				<SettingsRow label="Picture link">
					<CommitInput
						value={me?.profile?.avatar_url ?? ""}
						placeholder="https://…"
						ariaLabel="Picture link"
						onCommit={(next) => void saveProfile({ avatar_url: next || null })}
					/>
				</SettingsRow>
			</SettingsGroup>
			<SettingsGroup label="Account">
				<SettingsRow label="Signed in as">
					<span className="text-sm">{email ?? me?.email ?? "—"}</span>
				</SettingsRow>
				<SettingsRow label="Sign out">
					<Button variant="outline" size="sm" onClick={() => void signOut()}>
						Sign out
					</Button>
				</SettingsRow>
			</SettingsGroup>
			{quota && (
				<SettingsGroup label="Plan">
					<SettingsRow
						label={quota.plan === "pro" ? "Pro" : "Free"}
						hint={
							quota.ownKeys
								? "You're using your own API keys, so lessons aren't counted."
								: `${quota.used} of ${quota.limit} lessons used this month on Kapany's models.`
						}
					>
						{me?.billing &&
							(quota.plan === "pro" ? (
								<Button variant="outline" size="sm" disabled={busy} onClick={() => void goToBilling("portal")}>
									Manage billing
								</Button>
							) : (
								<Button size="sm" disabled={busy} onClick={() => void goToBilling("checkout")}>
									Upgrade to Pro
								</Button>
							))}
					</SettingsRow>
				</SettingsGroup>
			)}
		</>
	);
}

/** The profile picture, or the name's first letter when there is none. */
function Avatar({ src, name }: { src?: string | null; name?: string | null }) {
	if (src) return <img src={src} alt="" className="size-10 rounded-full object-cover" />;
	return (
		<span className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-medium uppercase">
			{name?.trim().charAt(0) || "?"}
		</span>
	);
}
