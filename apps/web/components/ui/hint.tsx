"use client"

import * as React from "react"
import { Tooltip } from "@/components/ui/tooltip"
import { bindingForAction, formatBinding, type KeyAction } from "@/src/core"

/**
 * The tooltip composition for icon and pill controls. The Astryx tooltip
 * carries the label, with the control's shortcut appended in parentheses when
 * it has one ("Dictate (⌘D)") — the owner call: the em-dash suffix read
 * as too much air.
 *
 * The binding is override-aware: pass `action` for registry shortcuts (a
 * user rebind in Settings → Keyboard changes the suffix live), or
 * `binding` for surface-owned keys with no registry entry ("escape" for a
 * dialog close, "enter" for a form submit).
 *
 * children is the trigger element the tooltip anchors to.
 */

interface HintProps {
	label: string
	/** Registry action whose LIVE binding is shown (override-aware). */
	action?: KeyAction
	/** Surface-owned binding ("escape", "enter") — keys the registry
	 *  deliberately doesn't dispatch (Esc closes the dialog itself; Enter
	 *  submits the form the button belongs to). */
	binding?: string
	side?: "top" | "bottom" | "left" | "right"
	children: React.ReactElement
}

/** The composition itself, pure — "Dictate" + ⌘D → "Dictate (⌘D)". Exported
 *  for the mechanism pins (tests/tooltip-mechanism.test.tsx). */
export function hintText(label: string, action?: KeyAction, binding?: string): string {
	const live = action
		? formatBinding(bindingForAction(action))
		: binding
			? formatBinding(binding)
			: ""
	return live ? `${label} (${live})` : label
}

export function Hint({ label, action, binding, side = "top", children }: HintProps) {
	return (
		<Tooltip content={hintText(label, action, binding)} side={side}>
			{children}
		</Tooltip>
	)
}
