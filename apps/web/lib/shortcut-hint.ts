import { bindingForAction, formatBinding, type KeyAction } from "@/src/core";

/** Rest delay (ms) before a tooltip opens: shown when you pause on a
 *  control, never in passing. */
export const TOOLTIP_DELAY_MS = 500;

/** A control's tooltip text with its live shortcut appended:
 *  "Dictate" + ⌘D → "Dictate (⌘D)". `action` reads the user's current
 *  binding (rebinds show live); `binding` is for surface-owned keys
 *  like "escape" that aren't in the registry. */
export function hintText(label: string, action?: KeyAction, binding?: string): string {
	const live = action ? formatBinding(bindingForAction(action)) : binding ? formatBinding(binding) : "";
	return live ? `${label} (${live})` : label;
}
