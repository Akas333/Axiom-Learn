/**
 * Settings → About you: edit the learner profile the onboarding collected.
 * Choices save immediately; notes save on blur. "Replay the intro" reopens
 * the onboarding walkthrough.
 */

import { Button } from "@astryxdesign/core/Button";
import { useState } from "react";
import type { LearnerSettings } from "@/src/core";
import { notifySettingsSaved } from "@/components/settings-signal";
import { LevelPicker, MathPicker, NotesField, StylePicker, saveLearner } from "@/components/learner-profile";
import { openOnboarding } from "@/components/onboarding";
import { SettingsGroup } from "./controls.tsx";

export function LearnerSection({
	learner,
	onSave,
}: {
	learner: LearnerSettings | undefined;
	/** Mirror the stored section into the dialog's record. */
	onSave: (next: LearnerSettings) => void;
}) {
	const [profile, setProfile] = useState<LearnerSettings>(learner ?? {});
	const [notes, setNotes] = useState(learner?.notes ?? "");
	const [status, setStatus] = useState<"idle" | "saving" | "saved" | string>("idle");

	const persist = async (next: LearnerSettings) => {
		const body: LearnerSettings = { ...next };
		if (!body.notes?.trim()) delete body.notes;
		setProfile(body);
		setStatus("saving");
		const result = await saveLearner(body);
		if (!result.ok) {
			setStatus(result.error);
			return;
		}
		setStatus("saved");
		onSave(body);
		notifySettingsSaved("learner");
	};

	return (
		<div data-testid="learner-section">
			<SettingsGroup label="Your level">
				<div className="mt-2">
					<LevelPicker value={profile.level} onChange={(level) => void persist({ ...profile, level })} />
				</div>
			</SettingsGroup>
			<SettingsGroup label="How much math">
				<div className="mt-2">
					<MathPicker value={profile.math} onChange={(math) => void persist({ ...profile, math })} />
				</div>
			</SettingsGroup>
			<SettingsGroup label="Explanation style">
				<div className="mt-2">
					<StylePicker value={profile.style} onChange={(style) => void persist({ ...profile, style })} />
				</div>
			</SettingsGroup>
			<SettingsGroup label="Notes for your tutor">
				<p className="mb-3 text-sm text-secondary">
					Anything else: your grade, what you're studying for, what you already know, how you like to learn.
				</p>
				<NotesField
					value={notes}
					onChange={setNotes}
					onCommit={(text) => {
						if (text !== (profile.notes ?? "")) void persist({ ...profile, notes: text });
					}}
				/>
			</SettingsGroup>
			<div className="mt-8 flex items-center gap-4">
				<Button variant="secondary" size="sm" label="Replay the intro" data-testid="learner-replay" onClick={openOnboarding} />
				<span className="text-sm text-secondary" role="status">
					{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "idle" ? "" : status}
				</span>
			</div>
		</div>
	);
}
