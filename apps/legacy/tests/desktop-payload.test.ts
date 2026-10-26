/** Run the real payload-curation script in throwaway repository fixtures. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";

const source = fs.readFileSync(new URL("../scripts/build-server.mjs", import.meta.url), "utf8");
// Fixtures mirror the monorepo: the app at apps/legacy, and a standalone tree
// that mirrors the repo root (server at apps/legacy/, prompts under the engine).
const APP = path.join("apps", "legacy");
const STANDALONE = path.join(APP, ".next", "standalone");
const APP_OUT = path.join(STANDALONE, APP);
const ENGINE_OUT = path.join(STANDALONE, "packages", "engine");
const PROMPT = path.join(ENGINE_OUT, "src", "agent", "system-prompt.md");

function withPayload(test: (fixture: {
	root: string;
	write: (relative: string, content?: string) => void;
	run: () => ReturnType<typeof spawnSync>;
}) => void) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "lh-payload-test-"));
	const write = (relative: string, content = "fixture") => {
		const target = path.join(root, relative);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, content);
	};
	try {
		write(path.join(APP, "scripts", "build-server.mjs"), source);
		write(path.join(APP_OUT, "server.js"));
		write(path.join(APP, ".next", "static", "runtime.js"));
		write(path.join(APP, "public", "asset.txt"));
		write(PROMPT);
		write(path.join(ENGINE_OUT, "src", "agent", "prompts", "teacher", "20-teaching.md"));
		test({ root, write, run: () => spawnSync(process.execPath, [path.join(root, APP, "scripts", "build-server.mjs")], {
			cwd: path.join(root, APP), encoding: "utf8", timeout: 10_000,
		}) });
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

describe("desktop standalone payload", () => {
	it("removes only traced installers/dev Electron, preserving runtime dist/ and native binaries", () => {
		withPayload(({ root, write, run }) => {
			for (const extra of [path.join("dist", "old.app", "nested.dmg"), path.join("node_modules", "electron", "dist", "electron.exe")]) {
				// BOTH copies exist: curation must not touch the real repo's build/runtime.
				write(extra);
				write(path.join(STANDALONE, extra));
			}
			// The app's own previous installers, traced under the app dir.
			write(path.join(APP, "dist", "old.app", "nested.dmg"));
			write(path.join(APP_OUT, "dist", "old.app", "nested.dmg"));
			const runtime = [
				"node_modules/@earendil-works/pi-ai/dist/index.js",
				"node_modules/@earendil-works/pi-agent-core/dist/index.js",
				"node_modules/@napi-rs/canvas-darwin-arm64/skia.darwin-arm64.node",
				"node_modules/@resvg/resvg-js-win32-x64-msvc/resvgjs.win32-x64-msvc.node",
				"node_modules/electron-updater/out/main.js",
			];
			for (const file of runtime) write(path.join(STANDALONE, file));
			const result = run();
			assert.equal(result.status, 0, String(result.stderr));
			assert.equal(fs.existsSync(path.join(root, STANDALONE, "dist")), false);
			assert.equal(fs.existsSync(path.join(root, APP_OUT, "dist")), false);
			assert.ok(fs.existsSync(path.join(root, APP, "dist", "old.app", "nested.dmg")));
			assert.equal(fs.existsSync(path.join(root, STANDALONE, "node_modules", "electron")), false);
			assert.ok(fs.existsSync(path.join(root, "dist", "old.app", "nested.dmg")));
			assert.ok(fs.existsSync(path.join(root, "node_modules", "electron", "dist", "electron.exe")));
			for (const file of runtime) assert.ok(fs.existsSync(path.join(root, STANDALONE, file)), file);
			assert.ok(fs.existsSync(path.join(root, APP_OUT, ".next", "static", "runtime.js")));
			assert.ok(fs.existsSync(path.join(root, APP_OUT, "public", "asset.txt")));
		});
	});

	it("accepts a clean payload and is idempotent", () => {
		withPayload(({ run }) => {
			for (let i = 0; i < 2; i++) {
				const result = run();
				assert.equal(result.status, 0, String(result.stderr));
				assert.match(String(result.stdout), /server payload ready/);
			}
		});
	});

	it("still refuses leaked developer data or keys", () => {
		// Any payload dir: the standalone root, the app, or the engine package.
		for (const dir of [STANDALONE, APP_OUT, ENGINE_OUT]) {
			for (const leaked of ["data/chat.json", "auth.json", ".env", ".env.local"]) {
				withPayload(({ write, run }) => {
					write(path.join(dir, leaked));
					const result = run();
					assert.equal(result.status, 1, path.join(dir, leaked));
					assert.match(String(result.stderr), /REFUSING/);
				});
			}
		}
	});

	it("still refuses a missing runtime prompt asset", () => {
		withPayload(({ root, run }) => {
			fs.rmSync(path.join(root, PROMPT));
			const result = run();
			assert.equal(result.status, 1);
			assert.match(String(result.stderr), /prompt asset missing/);
		});
	});
});
