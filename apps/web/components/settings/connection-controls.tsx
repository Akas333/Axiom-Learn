import { Dialog } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";

export function ConnectionRow({ label, action, disabled, onAction, children, testid, actionTestid }: { label: string; action: string; disabled: boolean; onAction: () => void; children?: React.ReactNode; testid?: string; actionTestid?: string }) {
	return (
		<HStack gap={3} align="center" wrap="wrap" data-testid={testid}>
			<Text type="body">{label}</Text>
			{children}
			<Button variant={action === "Connect" ? "secondary" : "ghost"} size="sm" label={action} isDisabled={disabled} data-testid={actionTestid} onClick={onAction} />
		</HStack>
	);
}

export function ConnectionFooter({ leading, children, testid }: { leading?: React.ReactNode; children: React.ReactNode; testid?: string }) {
	return (
		<HStack gap={3} align="center" justify="between" wrap="wrap" className="mt-4" data-testid={testid}>
			{leading}
			<HStack gap={2} align="center" justify="end" wrap="wrap" className="ml-auto">
				{children}
			</HStack>
		</HStack>
	);
}

/** A connection flow's modal (sign-in, manage, disconnect). An Astryx
 *  Dialog, so it stacks above the settings dialog in the top layer. */
export function ConnectionDialog({ children, onClose, busy, label, testid }: { children: React.ReactNode; onClose: () => void; busy: boolean; label: string; testid: string; backdropTestid?: string }) {
	return (
		<Dialog
			isOpen
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
			purpose="form"
			width={512}
			maxHeight="85dvh"
			padding={5}
			aria-label={label}
			aria-busy={busy}
			data-testid={testid}
		>
			{children}
		</Dialog>
	);
}
