import { useEffect, useRef } from "react";
import { GraphSphereRenderer } from "./graph-sphere.ts";

/** A theme colour as #rrggbb (the tokens in globals.css are already hex). */
function tokenColor(cssVar: string, fallback: string): string {
	const v = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
	return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}

/**
 * The bare lattice globe, slowly turning behind a hero (the Muse Code look).
 * Purely decorative: no pointer input, hidden from assistive tech, and it
 * fades out toward the edges so it never competes with the content on top.
 * The parent must be `relative` (the canvas fills it).
 */
export function SphereBackdrop({ zoom = 1.9, density = 2400 }: { zoom?: number; density?: number }) {
	const ref = useRef<HTMLCanvasElement | null>(null);
	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const noop = () => {};
		const renderer = new GraphSphereRenderer(
			canvas,
			{ onSelect: noop, onContext: noop, onStageClick: noop, onCameraMove: noop, onCommit: noop },
			{ latticePoints: density },
		);
		renderer.setZoom(zoom);
		const fg = tokenColor("--foreground", "#f2f4f6");
		renderer.setData({
			nodes: [],
			edges: [],
			clusters: [],
			colors: { node: fg, edge: fg, label: tokenColor("--muted-foreground", "#9fa4ab"), hoverText: fg },
			fontFamily: getComputedStyle(document.body).fontFamily,
		});
		return () => renderer.destroy();
	}, [zoom, density]);
	return (
		<canvas
			ref={ref}
			aria-hidden
			className="pointer-events-none absolute inset-0 block h-full w-full"
			style={{
				maskImage: "radial-gradient(ellipse at center, black 35%, transparent 80%)",
				WebkitMaskImage: "radial-gradient(ellipse at center, black 35%, transparent 80%)",
			}}
		/>
	);
}
