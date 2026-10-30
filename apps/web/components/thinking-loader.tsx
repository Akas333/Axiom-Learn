import { useEffect, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";

/**
 * The turn loader (2026-10-29): the chat's "a turn is in flight" line.
 * Its mark speaks the plan map's language — three round nodes on one link;
 * a spark runs the link and lights each node as it passes, the way a plan
 * lights up as it is taught. Then the state in sentence case, and, once
 * the turn has run a few seconds, how long.
 *
 * CSS-only motion (globals.css .lh-trail-*): the spark and the lit nodes
 * are compositor-animated; reduced motion shows a still mark with the
 * first node lit.
 */

/** The link's ends and the nodes' centres, in the mark's viewBox units. */
const NODES = [3, 13, 23] as const;

/** Whole seconds since mount, ticking once a second. */
function useElapsedSeconds(): number {
	const [seconds, setSeconds] = useState(0);
	useEffect(() => {
		const started = Date.now();
		const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
		return () => clearInterval(id);
	}, []);
	return seconds;
}

/** The elapsed time stays hidden for quick turns. */
const SHOW_ELAPSED_AFTER_S = 3;

export function ThinkingLoader({ label, className, testId }: { label: string; className?: string; testId?: string }) {
	const elapsed = useElapsedSeconds();
	return (
		<span
			role="status"
			aria-label={label}
			data-testid={testId ?? "thinking-loader"}
			className={cn("flex items-center gap-2.5 text-[13px] text-muted-foreground", className)}
		>
			<svg viewBox="0 0 26 10" className="h-3 w-auto shrink-0 overflow-visible" aria-hidden>
				<line x1={NODES[0]} y1={5} x2={NODES[2]} y2={5} strokeWidth={1} className="stroke-border" />
				{NODES.map((cx) => (
					<circle key={`base-${cx}`} cx={cx} cy={5} r={2.4} strokeWidth={1} className="fill-card stroke-border" />
				))}
				{NODES.map((cx, i) => (
					<circle key={`lit-${cx}`} cx={cx} cy={5} r={2.4} data-i={i} className="lh-trail-node fill-primary" />
				))}
				<circle cx={NODES[0]} cy={5} r={1.3} className="lh-trail-spark fill-primary" />
			</svg>
			<Shimmer as="span" duration={1.8}>
				{label}
			</Shimmer>
			{elapsed >= SHOW_ELAPSED_AFTER_S && <span className="tabular-nums text-muted-foreground/60">{elapsed}s</span>}
		</span>
	);
}
