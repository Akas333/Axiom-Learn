/**
 * Settings control kit, built on Astryx: sections → groups → rows, plus
 * the switch, select and commit-on-blur input every section uses.
 *
 * Dependency graying: the WHOLE row dims (label and control together)
 * and the control itself locks — the row owns the dim.
 */

import { Children, createContext, isValidElement, useState, type ReactNode } from "react";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { cn } from "@/lib/utils";

/** Kept for callers that mark the settings dialog; Astryx controls look
 *  the same inside and outside it. */
export const SettingsSkinContext = createContext(false);

/** A section block: heading + optional hint + rows. */
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
		<VStack as="section" data-testid={testid} gap={1} paddingInline={6} paddingBlock={6}>
			<Heading level={2}>{title}</Heading>
			{hint && <Text type="supporting">{hint}</Text>}
			<VStack paddingBlockStart={3}>{children}</VStack>
		</VStack>
	);
}

/** A labeled sub-group inside a section. */
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
		<VStack data-testid={testid} className="mt-10 first:mt-2">
			<Heading level={3}>{label}</Heading>
			<VStack>{children}</VStack>
		</VStack>
	);
}

/** One label + one control: label left (with optional muted hint), control right. */
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
	/** The whole row dims when the control is inert (parent off, …). */
	dimmed?: boolean;
}) {
	return (
		<HStack
			data-testid={testid}
			gap={6}
			align="center"
			justify="between"
			wrap="wrap"
			paddingBlock={4}
			className={cn("border-b border-border last:border-b-0", dimmed && "opacity-40")}
		>
			<VStack gap={1} className="min-w-0 flex-1 basis-40">
				<Text type="body">{label}</Text>
				{hint && (
					<Text type="supporting" className="max-w-[62ch]">
						{hint}
					</Text>
				)}
			</VStack>
			<HStack gap={2} align="center" wrap="wrap" justify="end" className="ml-auto max-w-full">
				{children}
			</HStack>
		</HStack>
	);
}

/** The on/off switch (Astryx Switch, label kept for screen readers). */
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
	/** Accessible name for the switch. */
	label: string;
	/** Optional icon shown before the switch (the figure cards' invert toggle). */
	discIcon?: ReactNode;
	/** Optional explanation shown when disabled. */
	title?: string;
}) {
	const sw = (
		<Switch
			label={label}
			isLabelHidden
			size={discIcon ? "sm" : "md"}
			value={checked}
			isDisabled={disabled}
			disabledMessage={disabled ? title : undefined}
			data-testid={`toggle-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
			onChange={(next) => onChange(next)}
		/>
	);
	if (!discIcon) return sw;
	return (
		<HStack gap={1} align="center" className="text-secondary">
			{discIcon}
			{sw}
		</HStack>
	);
}

/** A select. Accepts native <option> children and renders an Astryx Selector. */
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
	const options = Children.toArray(children).flatMap((child) => {
		if (!isValidElement<{ value?: string; children?: ReactNode; disabled?: boolean }>(child)) return [];
		const label = Children.toArray(child.props.children).join("");
		const v = child.props.value ?? label;
		return [{ value: String(v), label, disabled: child.props.disabled }];
	});
	return (
		<Selector
			label={ariaLabel}
			isLabelHidden
			size="sm"
			options={options}
			value={value}
			isDisabled={disabled}
			onChange={(next) => next != null && onChange(next)}
			containerClassName="min-w-40"
			data-testid={testid}
		/>
	);
}

/** A text/number input committing on blur + Enter (every commit is a
 *  section PUT, so it commits at settings pace, not typing pace). */
export function CommitInput({
	value,
	placeholder,
	onCommit,
	ariaLabel,
	testid,
	type = "text",
}: {
	/** "" = unset (the factory default). Mirrors the STORED record, so
	 *  after a clamped commit the field snaps to what landed. */
	value: string;
	placeholder?: string;
	onCommit: (next: string) => void;
	ariaLabel: string;
	testid?: string;
	type?: "text" | "number";
}) {
	// The draft exists only while editing; a blur shows the record again.
	const [draft, setDraft] = useState(value);
	const [editing, setEditing] = useState(false);
	const commit = () => {
		if (!editing) return;
		setEditing(false);
		const next = draft.trim();
		if (next !== value) onCommit(next);
	};
	return (
		<TextInput
			label={ariaLabel}
			isLabelHidden
			size="sm"
			width={type === "number" ? 112 : 192}
			value={editing ? draft : value}
			placeholder={placeholder}
			data-testid={testid}
			onChange={(next) => {
				setEditing(true);
				setDraft(next);
			}}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") e.currentTarget.blur();
				if (e.key === "Escape") {
					setEditing(false);
					e.currentTarget.blur();
				}
			}}
		/>
	);
}
