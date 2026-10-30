import { useCallback, useEffect, useState } from "react";
import { UserIcon } from "lucide-react";
import type { UserSettings } from "@/src/core";
import { useAuth } from "@/lib/auth";
import { useSettingsSaved } from "@/components/settings-signal";
import { cn } from "@/lib/utils";

/**
 * Who the sidebar's account row shows (2026-10-30, replacing the Kapany
 * brand row). A local install has no sign-in, so it reads the profile
 * section of the settings record; the hosted app reads the signed-in
 * profile and plan from /api/me. Re-read whenever a profile is saved.
 */
export interface ProfileView {
	name: string | null;
	avatar: string | null;
	/** The line under the name: the plan when hosted, "Local" otherwise. */
	detail: string;
	/** The settings section that edits it. */
	section: "profile" | "account";
}

interface Me {
	email: string | null;
	profile: { display_name: string | null; avatar_url: string | null } | null;
	quota?: { plan: "free" | "pro" };
}

export function useProfileView(): ProfileView {
	const { supabase, email } = useAuth();
	const hosted = supabase !== null;
	const [view, setView] = useState<ProfileView>({
		name: null,
		avatar: null,
		detail: hosted ? "" : "Local",
		section: hosted ? "account" : "profile",
	});
	const load = useCallback(async () => {
		try {
			if (hosted) {
				const res = await fetch("/api/me", { cache: "no-store" });
				if (!res.ok) return;
				const me = (await res.json()) as Me;
				setView({
					name: me.profile?.display_name ?? me.email ?? email,
					avatar: me.profile?.avatar_url ?? null,
					detail: me.quota?.plan === "pro" ? "Pro" : "Free",
					section: "account",
				});
				return;
			}
			const res = await fetch("/api/settings", { cache: "no-store" });
			if (!res.ok) return;
			const { settings } = (await res.json()) as { settings: UserSettings | null };
			setView({
				name: settings?.profile?.name ?? null,
				avatar: settings?.profile?.avatar ?? null,
				detail: "Local",
				section: "profile",
			});
		} catch {
			/* transient — the next profile save re-reads */
		}
	}, [hosted, email]);
	useEffect(() => {
		void load();
	}, [load]);
	useSettingsSaved((section) => {
		if (section === "profile") void load();
	});
	return view;
}

/** The profile photo, else the name's first letter, else a person glyph. */
export function ProfileAvatar({
	src,
	name,
	className,
}: {
	src?: string | null;
	name?: string | null;
	className?: string;
}) {
	if (src) return <img src={src} alt="" className={cn("shrink-0 rounded-full object-cover", className)} />;
	const initial = name?.trim().charAt(0);
	return (
		<span
			className={cn(
				"flex shrink-0 items-center justify-center rounded-full border border-input bg-card font-medium uppercase text-foreground",
				className,
			)}
		>
			{initial || <UserIcon className="size-1/2 text-muted-foreground" />}
		</span>
	);
}
