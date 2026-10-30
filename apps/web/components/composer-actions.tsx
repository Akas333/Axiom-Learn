
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
						? "border-border bg-card text-foreground hover:bg-accent"
						: "border-dashed border-border/80 bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground")
				}
			>
				<DumbbellIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
				{count > 0 ? `${count} ${count === 1 ? "node" : "nodes"} selected` : "Pick nodes"}
			</button>
			{count > 0 && (
				<button
					type="button"
					data-testid="practice-props-clear"
					onClick={onClear}
					className="cursor-pointer rounded-full px-2 py-1 font-ui text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					Clear
				</button>
			)}
		</div>
	);
}

/** The session a new chat starts as: guided teaching (the "teach" value,
 *  kept for existing selectors), the textbook style (2026-10-29), or
 *  practice. */
export type SessionMode = "teach" | "textbook" | "practice";

const SESSION_MODE_LABELS: Record<SessionMode, string> = { teach: "Guided", textbook: "Textbook", practice: "Practice" };

/** Guided | Textbook | Practice — the quiet text toggle that sits at the
 *  left of the row under the composer (home and the new-session draft
 *  share it). */
export function SessionModeToggle({
	mode,
	onChange,
	testIdPrefix = "home-mode",
}: {
	mode: SessionMode;
	onChange: (mode: SessionMode) => void;
	/** Kept per surface so existing selectors keep working. */
	testIdPrefix?: string;
}) {
	return (
		<div role="radiogroup" aria-label="Session type" className="flex items-center gap-0.5" data-testid={`${testIdPrefix}-switch`}>
			{(["teach", "textbook", "practice"] as const).map((m) => (
				<button
					key={m}
					type="button"
					role="radio"
					aria-checked={mode === m}
					data-testid={`${testIdPrefix}-${m}`}
					onClick={() => onChange(m)}
					className={`rounded-lg px-2 py-1 text-sm transition-colors ${
						mode === m ? "bg-(--pill) text-foreground" : "text-muted-foreground hover:text-foreground"
					}`}
				>
					{SESSION_MODE_LABELS[m]}
				</button>
			))}
		</div>
	);
}
