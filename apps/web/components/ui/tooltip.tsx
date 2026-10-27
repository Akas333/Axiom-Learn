/**
 * The app's tooltip: Astryx Tooltip. Opens after a short rest so it shows
 * when you pause on a control, never in passing.
 */
import * as React from "react";
import { Tooltip as AstryxTooltip } from "@astryxdesign/core/Tooltip";

/** The rest delay (ms) before a tooltip opens. */
export const TOOLTIP_DELAY_MS = 500;

type Side = "top" | "bottom" | "left" | "right";
const PLACEMENT = { top: "above", bottom: "below", left: "start", right: "end" } as const;

export function Tooltip({
	content,
	side = "top",
	children,
	isEnabled,
}: {
	content: React.ReactNode;
	side?: Side;
	children: React.ReactNode;
	isEnabled?: boolean;
}) {
	return (
		<AstryxTooltip
			content={content}
			placement={PLACEMENT[side]}
			delay={TOOLTIP_DELAY_MS}
			hasHoverIndication={false}
			isEnabled={isEnabled}
		>
			{children}
		</AstryxTooltip>
	);
}
