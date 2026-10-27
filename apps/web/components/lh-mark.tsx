import { useId } from "react";

/**
 * LhMark — the Kapany mark: a bent optical fibre carrying light that leaves
 * its end as a bright point (after Narinder Singh Kapany, who pioneered fibre
 * optics). Inlined as JSX so it is recolourable and crisp at any size.
 *
 * The fibre's cladding follows `currentColor`, so it reads on light and dark
 * themes; the light inside stays blue. No padding: sizing is the consumer's
 * job. The full app icon (with its dark tile) lives in public/favicon.svg.
 */
export function LhMark({ className = "" }: { className?: string }) {
	const id = useId();
	const core = `${id}-core`;
	const glow = `${id}-glow`;
	return (
		<svg viewBox="4 4 58 58" className={className} aria-hidden="true">
			<defs>
				<linearGradient id={core} x1="12" y1="50" x2="42" y2="20" gradientUnits="userSpaceOnUse">
					<stop offset="0" stopColor="#2563eb" />
					<stop offset="1" stopColor="#7dd3fc" />
				</linearGradient>
				<radialGradient id={glow}>
					<stop offset="0" stopColor="#7dd3fc" stopOpacity=".7" />
					<stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
				</radialGradient>
			</defs>
			<path d="M12 50C24 50 22 20 42 20" fill="none" stroke="currentColor" strokeOpacity=".22" strokeWidth="12" strokeLinecap="round" />
			<path d="M12 50C24 50 22 20 42 20" fill="none" stroke={`url(#${core})`} strokeWidth="4.5" strokeLinecap="round" />
			<circle cx="51" cy="20" r="10" fill={`url(#${glow})`} />
			<circle cx="51" cy="20" r="5.5" fill="#38bdf8" />
			<circle cx="51" cy="20" r="3.5" fill="#f0f9ff" />
		</svg>
	);
}
