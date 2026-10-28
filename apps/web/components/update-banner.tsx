
/**
 * The auto-update banner (Wave C, owner 2026-10-10: silent download +
 * restart-banner UX). The shell pushes "lh:update-status" once a staged
 * update exists (electron/main.cjs update-downloaded). Snapshot retrieval
 * also covers a late load. The card offers Restart alongside Settings.
 * Browser builds have no window.lh and never see a push: renders null.
 *
 * No dismiss: a downloaded update installs on quit anyway
 * (autoInstallOnAppQuit); the banner is a courtesy, not a gate.
 */

import { Button } from "@astryxdesign/core/Button";
import { useUpdateState } from "@/components/settings/update-settings.tsx";

export default function UpdateBanner() {
	const { state: ready } = useUpdateState();
	if (ready?.status !== "downloaded") return null;
	return (
		<div
			data-testid="update-banner"
			className="fixed right-[max(1rem,var(--safe-right))] bottom-[max(1rem,var(--safe-bottom))] left-[max(1rem,var(--safe-left))] z-50 flex items-center gap-3 sm:left-auto rounded-lg border border-border bg-popover px-4 py-3 shadow-lg"
		>
			<div className="text-sm">
				<span className="font-medium">Kapany {ready.version ?? "update"} is ready</span>
				<span className="text-secondary"> — restart to finish installing.</span>
			</div>
			<Button variant="secondary" size="sm" label="Restart" onClick={() => window.lh?.installUpdate?.()} />
		</div>
	);
}
