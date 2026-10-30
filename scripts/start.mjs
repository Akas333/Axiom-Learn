#!/usr/bin/env node
/**
 * One-step start for developers (npm start). Learners use the desktop app
 * (apps/desktop).
 *
 * Installs dependencies when they're missing or out of date, builds the web
 * app when its sources changed, starts the server with the web app on one
 * address, and opens it in the browser. No dependencies of its own: it runs
 * before npm install has.
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "apps/web");
const SERVER = path.join(ROOT, "apps/server");
const DIST_INDEX = path.join(WEB, "dist/index.html");
const PREFERRED_PORT = Number(process.env.PORT ?? 8787);
const MIN_NODE = 22;

const say = (line = "") => console.log(line);
const step = (line) => say(`\n▸ ${line}`);

function fail(message, hint) {
	say(`\n✖ ${message}`);
	if (hint) say(`  ${hint}`);
	process.exit(1);
}

function run(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32", ...options });
		child.on("error", reject);
		child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`))));
	});
}

/** Newest modification time under dir, skipping build output and dependencies. */
function newestMtime(dir) {
	let newest = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		const time = entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs;
		if (time > newest) newest = time;
	}
	return newest;
}

/** The path of a dependency's command-line entry, as seen from a workspace. */
function packageBin(workspace, name) {
	const manifest = createRequire(path.join(workspace, "package.json")).resolve(`${name}/package.json`);
	const { bin } = JSON.parse(readFileSync(manifest, "utf8"));
	return path.join(path.dirname(manifest), typeof bin === "string" ? bin : bin[name]);
}

function mtime(file) {
	return existsSync(file) ? statSync(file).mtimeMs : 0;
}

async function installIfNeeded() {
	const installed = path.join(ROOT, "node_modules/.package-lock.json");
	if (existsSync(installed) && mtime(installed) >= mtime(path.join(ROOT, "package-lock.json"))) return;
	step("Installing TYSA's parts (first time only, a few minutes)…");
	try {
		await run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: ROOT });
	} catch {
		fail("Installing failed.", "Check your internet connection, then start TYSA again.");
	}
}

async function buildIfNeeded() {
	const built = mtime(DIST_INDEX);
	const sources = Math.max(newestMtime(WEB), newestMtime(path.join(ROOT, "packages/engine/src")));
	if (built && built >= sources) return;
	step(built ? "Updating the app…" : "Preparing the app (first time only, about a minute)…");
	const vite = packageBin(WEB, "vite");
	try {
		await run(process.execPath, [vite, "build", "--logLevel", "error"], { cwd: WEB, shell: false });
	} catch {
		fail("Preparing the app failed.", "Start TYSA again. If it keeps failing, share the messages above with the developers.");
	}
}

/** Is a TYSA server (with the web app) already answering on this port? */
async function kapanyAt(port) {
	try {
		const [api, page] = await Promise.all([
			fetch(`http://127.0.0.1:${port}/api/keys`, { signal: AbortSignal.timeout(1500) }),
			fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) }),
		]);
		return api.ok && page.ok && (page.headers.get("content-type") ?? "").includes("text/html");
	} catch {
		return false;
	}
}

function portFree(port) {
	return new Promise((resolve) => {
		const probe = net.createServer().once("error", () => resolve(false));
		probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
	});
}

async function freePort(from) {
	for (let port = from; port < from + 50; port++) if (await portFree(port)) return port;
	fail("No free port found to run TYSA on.", "Restart your computer and try again.");
}

function openBrowser(url) {
	if (process.env.KAPANY_NO_BROWSER === "1") return;
	const [command, args] =
		process.platform === "darwin" ? ["open", [url]]
		: process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
		: ["xdg-open", [url]];
	spawn(command, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

async function waitUntilUp(url, child) {
	for (let i = 0; i < 120; i++) {
		if (child.exitCode !== null) return false;
		try {
			if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return true;
		} catch {}
		await new Promise((r) => setTimeout(r, 500));
	}
	return false;
}

async function main() {
	const major = Number(process.versions.node.split(".")[0]);
	if (major < MIN_NODE) fail(`TYSA needs Node.js ${MIN_NODE} or newer (this is ${process.versions.node}).`, "Install Node.js 22 or newer from https://nodejs.org, or use the TYSA desktop app.");

	say("Starting TYSA…");

	if (await kapanyAt(PREFERRED_PORT)) {
		const url = `http://localhost:${PREFERRED_PORT}`;
		say(`\nTYSA is already running. Opening ${url}`);
		openBrowser(url);
		return;
	}

	await installIfNeeded();
	await buildIfNeeded();

	const port = await freePort(PREFERRED_PORT);
	const url = `http://localhost:${port}`;
	step("Starting the tutor…");
	const tsx = packageBin(SERVER, "tsx");
	const server = spawn(process.execPath, [tsx, "src/index.ts"], {
		cwd: SERVER,
		stdio: "inherit",
		env: { ...process.env, PORT: String(port), KAPANY_SERVE_WEB: "1" },
	});
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => server.kill(signal));
	server.on("exit", (code) => process.exit(code ?? 0));

	if (!(await waitUntilUp(url, server))) fail("TYSA didn't start.", "Share the messages above with the developers.");

	say("");
	say("──────────────────────────────────────────────");
	say(`  TYSA is running:  ${url}`);
	say("");
	say("  Keep this window open while you use TYSA.");
	say("  To stop it, close this window.");
	say("──────────────────────────────────────────────");
	openBrowser(url);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
