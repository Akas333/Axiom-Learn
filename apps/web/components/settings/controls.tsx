/**
 * Thin settings primitives (settings-app wave): the control kit the
 * settings dialog needs. Sections → groups → rows; everything SSRs clean
 * (render tests pin the sections' markup).
 *
 * The dependency graying (owner, 2026-09-20) follows the graph viewer's
 * render-panel convention: the WHOLE row dims (opacity-40, label and
 * control together) and the control itself locks — the row owns the dim.
 */

import { createContext, useContext, useState, type ReactNode } from "react";

/** The settings dialog's roomier skin: larger blue switches, taller
 *  selects/inputs. Off (the default) outside the dialog — the figure
 *  cards keep their compact toggle. */
export const SettingsSkinContext = createContext(false);
import { cn } from "@/lib/utils";

/** A section block: pronounced mono heading + content. */
export function SettingsSection({
	title,
	hint,
	children,
	testid,
}: {
	title: string;
	/** One quiet line under the header — only where it earns its place. */
	hint?: string;
	children: React.ReactNode;
	testid?: string;
}) {
	return (
		<section data-testid={testid} className="px-5 py-6 sm:px-8">
			<h2 className="text-lg font-medium text-foreground">{title}</h2>
			{hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
			<div className="mt-4 flex flex-col">{children}</div>
		</section>
	);
}

/** A labeled sub-group inside a section (owner, 2026-09-20: clear
 *  separation — Models / Tools / Prompts read as three blocks). */
export function SettingsGroup({
	label,
	children,
	testid,
}: {
	label: string;
	children: React.ReactNode;
	testid?: string;
}) {
	return (
		<div data-testid={testid} className="mt-10 first:mt-2">
			<h3 className="mb-1 text-base font-medium text-foreground">{label}</h3>
			<div className="flex flex-col">{children}</div>
		</div>
	);
}

/** One label + one control. Label left (with optional muted hint), control
 *  right — the settings row shape. */
export function SettingsRow({
	label,
	hint,
	children,
	testid,
	dimmed,
}: {
	label: string;
	hint?: ReactNode;
	children: React.ReactNode;
	testid?: string;
	/** Dependency graying, graph-view style: the whole row dims when the
	 *  control is inert (parent off, no file yet, …). */
	dimmed?: boolean;
}) {
	return (
		<div
			data-testid={testid}
			className={cn(
				"flex items-center justify-between gap-6 border-b border-border/60 py-4 last:border-b-0 max-sm:flex-wrap max-sm:gap-x-4 max-sm:gap-y-2",
				dimmed && "opacity-40",
			)}
		>
			<span className="min-w-0 max-sm:flex-1 max-sm:basis-40">
				<span className="block text-[15px] text-foreground">{label}</span>
				{hint && <span className="mt-1 block max-w-[62ch] text-sm leading-relaxed text-muted-foreground">{hint}</span>}
			</span>
			<span className="flex shrink-0 items-center max-sm:ml-auto max-sm:max-w-full max-sm:shrink max-sm:flex-wrap max-sm:justify-end max-sm:gap-2">{children}</span>
		</div>
	);
}

/** The on/off switch — a plain button in the switch role. */
export function Toggle({
	checked,
	disabled,
	onChange,
	label,
	discIcon,
	title,
}: {
	checked: boolean;
	disabled?: boolean;
	onChange: (next: boolean) => void;
	/** Accessible name for the switch role. */
	label: string;
	/** Optional icon disc (owner round, 2026-10-07): the figure cards' invert
	 *  toggle renders the half-filled contrast circle AS the disc — the icon
	 *  carries the meaning; plain toggles keep the plain disc. */
	discIcon?: ReactNode;
	/** Optional native tooltip on the switch. */
	title?: string;
}) {
	const roomy = useContext(SettingsSkinContext);
	if (roomy && !discIcon) {
		// Dialog skin: a blue track when on, white knob — the standard switch.
		return (
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				aria-label={label}
				{...(title ? { title } : {})}
				disabled={disabled}
				data-testid={`toggle-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
				onClick={() => onChange(!checked)}
				className={cn(
					"relative h-6 w-10 shrink-0 rounded-full transition-colors",
					checked ? "bg-primary" : "bg-muted-foreground/30",
					disabled && "cursor-not-allowed",
				)}
			>
				<span
					className={cn(
						"absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform",
						checked ? "translate-x-4" : "translate-x-0",
					)}
				/>
			</button>
		);
	}
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			{...(title ? { title } : {})}
			disabled={disabled}
			data-testid={`toggle-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
			onClick={() => onChange(!checked)}
			className={cn(
				"relative h-4.5 w-8 shrink-0 rounded-full border border-border transition-colors",
				// Owner (2026-09-20): on is a gray track with a WHITE disc (a full-white
				// track was too loud); off stays the muted track.
				checked ? "bg-muted-foreground" : "bg-muted",
				disabled && "cursor-not-allowed",
			)}
		>
			{discIcon ? (
				// The icon IS the disc: same size, same slide, same state colors —
				// only the knob's face changes (the invert affordance).
				<span
					className={cn(
						"absolute left-0 top-0.5 flex size-3 items-center justify-center rounded-full transition-transform",
						checked ? "translate-x-4 text-foreground" : "translate-x-0.5 text-muted-foreground",
					)}
				>
					{discIcon}
				</span>
			) : (
				<span
					className={cn(
						"absolute left-0 top-0.5 size-3 rounded-full transition-transform",
						// 2px inset from each inner edge, both states (owner round: the on
						// disc used to touch the pill's right edge).
						checked ? "translate-x-4 bg-foreground" : "translate-x-0.5 bg-muted-foreground",
					)}
				/>
			)}
		</button>
	);
}

/** A thin select — native element, options as given. */
export function ThinSelect({
	value,
	onChange,
	children,
	ariaLabel,
	testid,
	disabled,
}: {
	value: string;
	onChange: (next: string) => void;
	children: React.ReactNode;
	ariaLabel: string;
	testid?: string;
	disabled?: boolean;
}) {
	const roomy = useContext(SettingsSkinContext);
	return (
		<select
			value={value}
			aria-label={ariaLabel}
			data-testid={testid}
			disabled={disabled}
			onChange={(e) => onChange(e.target.value)}
			className={cn(
				roomy
					? "h-9 min-w-40 rounded-lg border border-border bg-(--pill) px-3 font-ui text-sm text-foreground outline-none"
					: "h-7 rounded-sm border border-border bg-background px-1.5 font-ui text-xs text-foreground outline-none",
				disabled && "cursor-not-allowed",
			)}
		>
			{children}
		</select>
	);
}

/** A thin hex/text input committing on blur + Enter (settings pace, not
 *  typing pace — every commit is a section PUT). */
export function CommitInput({
	value,
	placeholder,
	onCommit,
	ariaLabel,
	testid,
	type = "text",
}: {
	/** "" = unset (the factory default). Mirrors the STORED record —
	 *  after a clamped/normalized commit this flows back and the field
	 *  snaps to the stored truth (owner repro: a negative size kept
	 *  displaying "-5" while 12 was stored). */
	value: string;
	placeholder?: string;
	onCommit: (next: string) => void;
	ariaLabel: string;
	testid?: string;
	type?: "text" | "number";
}) {
	// The draft exists only while editing; a blur shows the record's value
	// again — commit-on-blur/Enter (owner ruling), the field honest about
	// what landed.
	const roomy = useContext(SettingsSkinContext);
	const [draft, setDraft] = useState(value);
	const [editing, setEditing] = useState(false);
	return (
		<input
			type={type}
			value={editing ? draft : value}
			placeholder={placeholder}
			aria-label={ariaLabel}
			data-testid={testid}
			onChange={(e) => {
				setEditing(true);
				setDraft(e.target.value);
			}}
			onBlur={() => {
				if (!editing) return;
				setEditing(false);
				const next = draft.trim();
				if (next !== value) onCommit(next);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") e.currentTarget.blur();
				if (e.key === "Escape") {
					setEditing(false);
					e.currentTarget.blur();
				}
			}}
			className={
				roomy
					? "h-9 w-48 rounded-lg border border-border bg-(--pill) px-3 font-ui text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-ring"
					: "h-7 w-40 rounded-sm border border-border bg-background px-2 font-ui text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
			}
		/>
	);
}