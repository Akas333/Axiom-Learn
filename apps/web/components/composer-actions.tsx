
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Button } from "@astryxdesign/core/Button";
import type { ReactNode } from "react";
import { DumbbellIcon } from "lucide-react";

/** Home and the draft share one wrapping action row. Picker controls lead;
 * setup is centered only when it is the sole action. */
export function ComposerActions({ picker, setup }: { picker?: ReactNode; setup?: ReactNode }) {
	if (!picker && !setup) return null;
	return (
		<div
			data-testid="composer-actions"
			className={`pointer-events-auto mb-2 flex flex-wrap items-center gap-2 ${picker ? "justify-start" : "justify-center"}`}
		>
			{picker}
			{setup}
		</div>
	);
}

/** Count and Clear stay together if the setup action wraps onto another line.
 * These are node counts, even when a whole chain supplied the selection. */
export function NodePickerControl({ count, onOpen, onClear }: {
	count: number;
	onOpen?: () => void;
	onClear?: () => void;
}) {
	return (
		<div className="flex items-center gap-1.5">
			<Button
				data-testid="practice-props-chip"
				variant="secondary"
				size="sm"
				icon={<DumbbellIcon className="size-4" />}
				label={count > 0 ? `${count} ${count === 1 ? "node" : "nodes"} selected` : "Pick nodes"}
				onClick={onOpen}
			/>
			{count > 0 && (
				<Button variant="ghost" size="sm" label="Clear" data-testid="practice-props-clear" onClick={onClear} />
			)}
		</div>
	);
}

/** Teach | Practice — the quiet text toggle that sits at the left of the
 *  row under the composer (home and the new-session draft share it). */
export function SessionModeToggle({
	mode,
	onChange,
	testIdPrefix = "home-mode",
}: {
	mode: "teach" | "practice";
	onChange: (mode: "teach" | "practice") => void;
	/** Kept per surface so existing selectors keep working. */
	testIdPrefix?: string;
}) {
	return (
		<SegmentedControl
			label="Session type"
			size="sm"
			value={mode}
			onChange={(next) => onChange(next === "practice" ? "practice" : "teach")}
			data-testid={`${testIdPrefix}-switch`}
		>
			{(["teach", "practice"] as const).map((m) => (
				<SegmentedControlItem key={m} value={m} label={m === "teach" ? "Teach" : "Practice"} data-testid={`${testIdPrefix}-${m}`} />
			))}
		</SegmentedControl>
	);
}
