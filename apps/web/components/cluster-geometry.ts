/**
 * Cluster color identity — pure presentation math for the knowledge-graph
 * regions. (The hull geometry that used to live here — convexHull,
 * outwardNormal, offsetPolygon, traceRoundedPath — was RETIRED with the
 * convex-hull renderer: regions are now a low-res world-space splat
 * bitmap in graph-canvas.ts, which renders concave cluster shapes
 * correctly and costs one blit per frame instead of 32 clusters × 4
 * offset polygons. The file keeps the name for the barrel imports.)
 */

export type Pt = { x: number; y: number };

/** The hue band cluster colours may use: the app's blue family (cyan →
 *  indigo, around --primary #0064e0 / --primary-soft #4ca3ff), so clusters
 *  stay distinguishable without leaving the Meta palette (no pinks/greens). */
const CLUSTER_HUE_MIN = 190;
const CLUSTER_HUE_SPAN = 60;

/** Stable hue per cluster id (content-hash): the region keeps its color
 *  across reshuffles because the id only changes when the members do. */
export function clusterHue(id: string): number {
	let h = 0;
	for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
	return CLUSTER_HUE_MIN + (h % (CLUSTER_HUE_SPAN + 1));
}
