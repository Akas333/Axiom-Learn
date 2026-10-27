import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(
	"data:text/javascript," +
		encodeURIComponent(`
			export function load(url, context, nextLoad) {
				if (url.endsWith(".css") || url.includes(".css?")) {
					return { format: "module", shortCircuit: true, source: "export default {};" };
				}
				return nextLoad(url, context);
			}
		`),
	pathToFileURL("./"),
);
