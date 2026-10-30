/**
 * Settings → Profile (local installs; the hosted app edits its profile
 * under Account): the name and photo the sidebar's account row shows.
 * Stored in the settings record, so it stays on this computer.
 */

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/profile";
import type { ProfileSettings } from "@/src/core";
import { CommitInput, SettingsRow } from "./controls.tsx";

const PHOTO_SIDE = 128;

/** Center-crop to a square and scale to 128px as a JPEG data: URL — a few
 *  KB, small enough to live in the settings record. */
async function squarePhoto(file: File): Promise<string> {
	const bitmap = await createImageBitmap(file);
	const side = Math.min(bitmap.width, bitmap.height);
	const canvas = document.createElement("canvas");
	canvas.width = PHOTO_SIDE;
	canvas.height = PHOTO_SIDE;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("no 2d canvas");
	ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIDE, PHOTO_SIDE);
	bitmap.close();
	return canvas.toDataURL("image/jpeg", 0.85);
}

export function ProfileSection({
	profile,
	onSectionChange,
}: {
	profile?: ProfileSettings;
	/** Replace-whole: an omitted field clears it. */
	onSectionChange: (next: ProfileSettings) => void;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [error, setError] = useState("");
	const name = profile?.name ?? "";
	const choosePhoto = async (file: File) => {
		setError("");
		try {
			onSectionChange({ ...profile, avatar: await squarePhoto(file) });
		} catch {
			setError("That image couldn't be read. Try a PNG or JPEG.");
		}
	};
	return (
		<>
			<SettingsRow label="Picture" hint={error || undefined} testid="row-profile-picture">
				<span className="flex items-center gap-2">
					<ProfileAvatar src={profile?.avatar} name={name} className="size-10 text-sm" />
					<Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
						{profile?.avatar ? "Change…" : "Upload…"}
					</Button>
					{profile?.avatar && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onSectionChange({ ...profile, avatar: undefined })}
						>
							Remove
						</Button>
					)}
					<input
						ref={inputRef}
						type="file"
						accept="image/*"
						hidden
						data-testid="profile-photo-input"
						onChange={(e) => {
							const file = e.target.files?.[0];
							e.target.value = "";
							if (file) void choosePhoto(file);
						}}
					/>
				</span>
			</SettingsRow>
			<SettingsRow label="Name" testid="row-profile-name">
				<CommitInput
					value={name}
					placeholder="Your name"
					ariaLabel="Your name"
					testid="profile-name"
					onCommit={(next) => onSectionChange({ ...profile, name: next || undefined })}
				/>
			</SettingsRow>
		</>
	);
}
