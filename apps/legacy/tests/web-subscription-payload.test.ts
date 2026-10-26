/** Exercise the real curator against synthetic payloads, never the repo payload. */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// Fixtures mirror the monorepo: the app at apps/legacy, its standalone tree
// mirroring the repo root. Secrets must be refused at the standalone root and
// inside the engine package (its config ROOT holds the dev key stores).
const APP = path.join("apps", "legacy");
const STANDALONE = path.join(APP, ".next", "standalone");

for (const name of ["chatgpt-credentials.json", "github-copilot-credentials.json", "xai-credentials.json"]) {
	for (const secret of [name, `${name}.fixture.tmp`]) for (const where of ["", path.join("packages", "engine")]) test(`payload curator refuses web credentials: ${path.join(where, secret)}`, () => {
		const root = mkdtempSync(path.join(tmpdir(), "lh-sub-payload-"));
		try {
			mkdirSync(path.join(root, APP, "scripts"), { recursive: true }); mkdirSync(path.join(root, STANDALONE, APP), { recursive: true }); mkdirSync(path.join(root, APP, ".next", "static"));
			mkdirSync(path.join(root, STANDALONE, where), { recursive: true });
			copyFileSync(new URL("../scripts/build-server.mjs", import.meta.url), path.join(root, APP, "scripts", "build-server.mjs"));
			writeFileSync(path.join(root, STANDALONE, APP, "server.js"), "// fixture");
			writeFileSync(path.join(root, STANDALONE, where, secret), "fixture-not-real-credentials", { mode: 0o600 });
			const result = spawnSync(process.execPath, [path.join(root, APP, "scripts", "build-server.mjs")], { encoding: "utf8", env: process.env });
			assert.equal(result.status, 1); assert(result.stderr.includes(`REFUSING: standalone contains ${path.join(where, secret)}`), result.stderr);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
}
