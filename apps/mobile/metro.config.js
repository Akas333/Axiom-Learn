// Metro config for Petrov. The app shares two pieces of the monorepo
// verbatim: the engine's browser-safe core (packages/engine/src/core) and
// the web app's session state machine (apps/web/components/session-core.ts).
// Both are plain TypeScript, so Metro just needs to see those folders.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..", "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
	path.join(repoRoot, "packages", "engine", "src"),
	path.join(repoRoot, "apps", "web", "components"),
	path.join(repoRoot, "node_modules"),
];

// Our own node_modules first; the repo root's for the engine's pure deps.
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules"), path.join(repoRoot, "node_modules")];

const engineSrc = path.join(repoRoot, "packages", "engine", "src");
const cryptoShim = path.join(projectRoot, "src", "lib", "crypto-shim.ts");
const ownReact = new Set(["react", "react-dom", "react-native"]);

config.resolver.resolveRequest = (context, moduleName, platform) => {
	// The engine core imports node:crypto for server-only helpers.
	if (moduleName === "node:crypto") return { type: "sourceFile", filePath: cryptoShim };
	// "@/src/..." is the web app's alias for the engine source tree.
	if (moduleName === "@/src" || moduleName.startsWith("@/src/")) {
		const rest = moduleName === "@/src" ? "" : moduleName.slice("@/src/".length);
		return context.resolveRequest(context, path.join(engineSrc, rest), platform);
	}
	// "@/..." is this app's own src/.
	if (moduleName.startsWith("@/")) {
		return context.resolveRequest(context, path.join(projectRoot, "src", moduleName.slice(2)), platform);
	}
	// One React only: shared files outside this folder must never pick up the
	// web app's React from the repo root.
	const bare = moduleName.split("/")[0];
	if (ownReact.has(bare)) {
		return context.resolveRequest({ ...context, originModulePath: path.join(projectRoot, "index.ts") }, moduleName, platform);
	}
	return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
