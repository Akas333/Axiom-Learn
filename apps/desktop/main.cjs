/**
 * TYSA's desktop shell. Starts the bundled API server (build/server) in a
 * background process on a free loopback port, with the learner's data and
 * keys in the app's own data folder, then shows the web app in a window.
 *
 * The server's environment is the engine's desktop contract
 * (packages/engine/config.ts): LH_DATA_DIR for records, LH_AUTH_FILE for
 * keys. KAPANY_SERVE_WEB/KAPANY_WEB_DIR make it serve the web app too.
 */

const { app, BrowserWindow, dialog, shell, utilityProcess } = require("electron");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const BUILD = path.join(__dirname, "build");
const SERVER = path.join(BUILD, "server", "index.mjs");

let server = null;
let serverUrl = null;
let window = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();

/** A free port on the loopback interface. */
function freePort() {
	return new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.once("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const { port } = probe.address();
			probe.close(() => resolve(port));
		});
	});
}

async function waitUntilUp(url) {
	for (let i = 0; i < 120; i++) {
		if (!server) return false;
		try {
			if ((await fetch(`${url}/api/keys`, { signal: AbortSignal.timeout(1000) })).ok) return true;
		} catch {}
		await new Promise((r) => setTimeout(r, 250));
	}
	return false;
}

async function startServer() {
	const userData = app.getPath("userData");
	const logs = path.join(userData, "logs");
	fs.mkdirSync(logs, { recursive: true });
	const log = fs.createWriteStream(path.join(logs, "server.log"), { flags: "w" });
	const port = await freePort();

	server = utilityProcess.fork(SERVER, [], {
		serviceName: "TYSA server",
		// serveStatic resolves the web folder relative to the working directory.
		cwd: path.dirname(SERVER),
		stdio: "pipe",
		env: {
			...process.env,
			HOST: "127.0.0.1",
			PORT: String(port),
			LH_DATA_DIR: path.join(userData, "data"),
			LH_AUTH_FILE: path.join(userData, "auth.json"),
			KAPANY_SERVE_WEB: "1",
			KAPANY_WEB_DIR: path.join(BUILD, "web"),
		},
	});
	server.stdout?.pipe(log);
	server.stderr?.pipe(log);
	server.on("exit", (code) => {
		server = null;
		if (quitting) return;
		dialog.showErrorBox(
			"TYSA stopped unexpectedly",
			`TYSA's background process exited (code ${code}).\n\nDetails are in:\n${path.join(logs, "server.log")}`,
		);
		app.quit();
	});

	const url = `http://127.0.0.1:${port}`;
	if (!(await waitUntilUp(url))) throw new Error(`TYSA didn't start. Details are in ${path.join(logs, "server.log")}`);
	return url;
}

function isAppUrl(target) {
	return serverUrl !== null && (target === serverUrl || target.startsWith(`${serverUrl}/`));
}

/** Links that leave the app open in the learner's browser instead. */
function openOutside(target) {
	if (/^https?:\/\//i.test(target)) shell.openExternal(target);
}

function createWindow() {
	window = new BrowserWindow({
		width: 1280,
		height: 840,
		minWidth: 420,
		minHeight: 520,
		title: "TYSA",
		backgroundColor: "#202020",
		show: false,
		webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
	});
	window.once("ready-to-show", () => window.show());
	window.on("closed", () => (window = null));

	const contents = window.webContents;
	contents.setWindowOpenHandler(({ url }) => {
		if (!isAppUrl(url)) openOutside(url);
		return { action: "deny" };
	});
	contents.on("will-navigate", (event, url) => {
		if (isAppUrl(url) || url.startsWith("file:")) return;
		event.preventDefault();
		openOutside(url);
	});
	// The page title is the web app's; the window keeps the app's name.
	window.on("page-title-updated", (event) => event.preventDefault());
	// Microphone (dictation) and clipboard only, and only for the app itself.
	contents.session.setPermissionRequestHandler((wc, permission, callback, details) => {
		const allowed = ["media", "clipboard-read", "clipboard-sanitized-write"].includes(permission);
		callback(allowed && isAppUrl(details.requestingUrl ?? wc.getURL()));
	});

	window.loadFile(path.join(__dirname, "loading.html"));
	if (serverUrl) window.loadURL(serverUrl);
}

app.on("second-instance", () => {
	if (!window) return;
	if (window.isMinimized()) window.restore();
	window.focus();
});

app.whenReady().then(async () => {
	createWindow();
	try {
		serverUrl = await startServer();
		window?.loadURL(serverUrl);
	} catch (error) {
		dialog.showErrorBox("TYSA couldn't start", error instanceof Error ? error.message : String(error));
		app.quit();
	}
});

// macOS: clicking the dock icon with no window open reopens it.
app.on("activate", () => {
	if (!window && serverUrl) createWindow();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
	quitting = true;
	server?.kill();
});
