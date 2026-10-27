/**
 * Hand a search term to the knowledge graph's "Search nodes" box from
 * elsewhere (the search palette). The graph view may not be mounted yet
 * (navigating home), so the term waits here until it is.
 */
const EVENT = "lh:graph-search";
let pending: string | null = null;

export function requestGraphSearch(term: string): void {
	pending = term;
	window.dispatchEvent(new CustomEvent(EVENT, { detail: term }));
}

/** Take (and clear) a term requested before the graph mounted. */
export function takePendingGraphSearch(): string | null {
	const t = pending;
	pending = null;
	return t;
}

export function onGraphSearch(handler: (term: string) => void): () => void {
	const listener = (e: Event) => {
		pending = null;
		handler((e as CustomEvent<string>).detail);
	};
	window.addEventListener(EVENT, listener);
	return () => window.removeEventListener(EVENT, listener);
}
