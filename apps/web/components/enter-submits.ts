
/**
 * ENTER SUBMITS — regardless of where focus is (owner round 6, 2026-10-05).
 * The dictation reality: the learner dictates into the dock's field without
 * ever focusing it, so Enter must submit from ANYWHERE — body focus, a
 * scroll, a stray link. The field's own Enter handler still fires first
 * when it IS focused (this listener sits at the window level, bubble's last
 * stop) — one law, two entry points, no double submit (the focused field's
 * handler claims the event via its own keydown; this hook skips typing
 * surfaces entirely).
 *
 * What the window listener refuses to touch:
 * - typing surfaces (input/textarea/select/contenteditable) — the focused
 *   surface owns its Enter (the dock field, the composer, settings). A
 *   slider, checkbox or radio is no typing surface: Enter submits there;
 * - modified Enter (⇧↵ is a newline, ⌘/Ctrl↵ belongs to the surface).
 *
 * BUTTONS — the pointer/keyboard split (owner, keyboard round 2026-10-10):
 * a mouse click on a transcript control (a thinking toggle, a copy button)
 * leaves focus ON that button; the learner's next Enter must SUBMIT, not
 * re-activate the toggle — the report that born this rule. But two button
 * populations keep native Enter-activates:
 *   1. KEYBOARD-focused buttons — :focus-visible means focus arrived by
 *      keyboard (the arrow-walked menus; Tab is dead app-wide, so this
 *      only happens inside overlays);
 *   2. buttons inside an OPEN OVERLAY — menus walk focus with arrows and
 *      Enter activates the walked button natively (menu-shell's contract),
 *      dialogs are their own surfaced layer (the ONE-ESC LAW's layers).
 * The pointer-clicked transcript button fails both tests → Enter is ours
 * (preventDefault also suppresses the browser's default activation, so
 * the toggle does not fire underneath the submit).
 *
 * The submit callbacks self-guard (empty thinking / canSubmit) — this hook
 * never checks answer validity, only focus honesty.
 */

import { useEffect, useRef } from "react";
import { isTypingSurface } from "@/src/core";

/** Overlay roots whose buttons keep native Enter (hand-rolled menus mark
 *  themselves data-lh-menu; Radix poppers/dialogs carry their own attrs). */
const OVERLAY_ROOTS = '[data-lh-menu], [data-radix-popper-content-wrapper], [role="menu"], [role="dialog"]';

/** Pure decision, exported for pins: does a focused BUTTON keep native
 *  Enter (true) or does Enter belong to submit (false)?
 *  `focusedByKeyboard` is how focus ARRIVED on it, sampled when it landed
 *  (useEnterSubmits) — never read at Enter time: Chromium turns
 *  :focus-visible on for the focused element the moment any key goes
 *  down, so asking then calls every mouse-clicked answer keyboard-focused
 *  and the Enter re-clicks it instead of submitting. */
export function buttonKeepsNativeEnter(el: HTMLElement, focusedByKeyboard: boolean): boolean {
	// Keyboard-walked focus: the menu arrows landed here — Enter activates.
	if (focusedByKeyboard) return true;
	// Inside an open overlay: the overlay owns its keys.
	return !!el.closest(OVERLAY_ROOTS);
}

/** Did focus land on `el` by keyboard? (Guarded: a selector engine
 *  without the pseudo degrades to "pointer", never throws.) */
function landedByKeyboard(el: Element): boolean {
	try {
		return el.matches(":focus-visible");
	} catch {
		return false;
	}
}

/** Inputs nothing is typed into — the confidence slider above all: a mouse
 *  drag leaves focus on it, and Enter there has no meaning of its own, so
 *  it submits (outside an overlay, whose controls own their keys). */
const KEYLESS_INPUTS = new Set(["range", "checkbox", "radio"]);

/** Pure decision, exported for pins: is the focused element a surface
 *  that owns its Enter? */
export function ownsEnter(e: KeyboardEvent): boolean {
	const t = e.target as HTMLElement | null;
	if (t?.tagName === "INPUT" && KEYLESS_INPUTS.has((t as HTMLInputElement).type)) return !!t.closest(OVERLAY_ROOTS);
	return isTypingSurface(e);
}

/** Mount-scoped: while the dock is mounted (a problem/question is active),
 *  plain Enter anywhere outside a typing surface or button submits it. */
export function useEnterSubmits(submit: () => void): void {
	const submitRef = useRef(submit);
	submitRef.current = submit;
	useEffect(() => {
		// The element focus last landed on by keyboard (see
		// buttonKeepsNativeEnter); a pointer focus clears it.
		let keyboardFocused: Element | null = null;
		const onFocusIn = (e: FocusEvent) => {
			const t = e.target as Element | null;
			keyboardFocused = t && landedByKeyboard(t) ? t : null;
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Enter") return;
			// A handler nearer the target already acted on this Enter (the
			// dock's walked-row submit) — never submit twice.
			if (e.defaultPrevented) return;
			if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
			if (ownsEnter(e)) return;
			const target = e.target as HTMLElement | null;
			if (target?.tagName === "BUTTON" && buttonKeepsNativeEnter(target, target === keyboardFocused)) return;
			e.preventDefault();
			submitRef.current();
		};
		document.addEventListener("focusin", onFocusIn, true);
		window.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("focusin", onFocusIn, true);
			window.removeEventListener("keydown", onKey);
		};
	}, []);
}
