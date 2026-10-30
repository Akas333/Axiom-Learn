/**
 * Prepares everything the desktop app ships, in apps/desktop/build:
 *
 *   build/server/index.mjs   the API server, bundled into one file
 *   build/server/src/agent/  the prompts, where the engine reads them
 *   build/web/               the built web app
 *
 * The server bundle leaves out the few packages that load native code or
 * their own data files at runtime; those ship as ordinary dependencies of
 * this package (see package.json).
 */

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(DESKTOP, "../..");
const OUT = path.join(DESKTOP, "build");
const require = createRequire(import.meta.url);

/** Loaded at runtime from node_modules: native code or package data files. */
export const RUNTIME_PACKAGES = ["@resvg/resvg-js", "@napi-rs/canvas", "pdfjs-dist", "puppeteer-core"];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("Building the web app…");
const vite = path.join(path.dirname(require.resolve("vite/package.json", { paths: [path.join(ROOT, "apps/web")] })), "bin/vite.js");
const web = spawnSync(process.execPath, [vite, "build", "--logLevel", "warn", "--outDir", path.join(OUT, "web"), "--emptyOutDir"], {
	cwd: path.join(ROOT, "apps/web"),
	stdio: "inherit",
});
if (web.status !== 0) process.exit(web.status ?? 1);

console.log("Bundling the server…");
await build({
	entryPoints: [path.join(ROOT, "apps/server/src/index.ts")],
	outfile: path.join(OUT, "server/index.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node22",
	external: RUNTIME_PACKAGES,
	// Bundled CommonJS dependencies still call require().
	banner: { js: "import { createRequire as __kapanyRequire } from 'node:module'; const require = __kapanyRequire(import.meta.url);" },
	logLevel: "warning",
});

// The engine reads its prompts relative to its own location (config.ts ROOT),
// which in the bundle is build/server.
const agent = path.join(ROOT, "packages/engine/src/agent");
cpSync(path.join(agent, "system-prompt.md"), path.join(OUT, "server/src/agent/system-prompt.md"));
cpSync(path.join(agent, "prompts"), path.join(OUT, "server/src/agent/prompts"), { recursive: true });

if (!existsSync(path.join(OUT, "web/index.html"))) throw new Error("web build missing");
console.log(`Done: ${path.relative(ROOT, OUT)}`);
