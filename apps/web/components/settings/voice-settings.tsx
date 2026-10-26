import { useHandsFreePref } from "@/components/voice-thinking";
import { SettingsRow, Toggle } from "./controls.tsx";

/** Settings → General: the hands-free voice switch (stored on this device). */
export function VoiceSettings() {
	const [on, setOn] = useHandsFreePref();
	return (
		<SettingsRow
			label="Hands-free voice thinking"
			hint="When a question appears, the mic listens on its own and writes down what you say. Stored on this device."
			testid="row-hands-free-voice"
		>
			<Toggle checked={on} onChange={setOn} label="Hands-free voice thinking" />
		</SettingsRow>
	);
}
