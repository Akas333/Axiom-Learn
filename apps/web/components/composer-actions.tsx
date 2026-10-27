
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Button } from "@/components/ui/button";
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
			<button
				type="button"
				data-testid="practice-props-chip"
				onClick={onOpen}
				className={
					"flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 font-ui text-xs transition-colors " +
					(count > 0
						? "border-border bg-card text-primary hover:bg-overlay-hover"
						: "border-dashed border-border/80 bg-transparent text-secondary hover:bg-overlay-hover hover:text-primary")
				}
			>
				<DumbbellIcon aria-hidden="true" className="size-3.5 text-secondary" />
				{count > 0 ? `${count} ${count === 1 ? "node" : "nodes"} selected` : "Pick nodes"}
			</button>
			{count > 0 && (
				<Button size="sm" variant="ghost" data-testid="practice-props-clear" onClick={onClear}>Clear</Button>
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
