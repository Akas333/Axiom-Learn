/**
 * A provider key hand-added to auth.json AFTER the server booted must reach
 * process.env before the turn builds its agent: pi-ai reads keys from env,
 * while the key-presence gate also reads the file — without the re-sync the
 * gate passed and the turn died mid-stream as "Provider is not configured".
 *
 * Own process: LH_AUTH_FILE / LH_DATA_DIR are module-load bound. Throwaway
 * values only, never real secrets.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

delete process.env.META_API_KEY;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-late-auth-key-"));
const AUTH = path.join(TMP, "auth.json");
process.env.LH_AUTH_FILE = AUTH;
process.env.LH_DATA_DIR = path.join(TMP, "data");
fs.writeFileSync(AUTH, "{}");
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// Boot: the server module runs its one-time fill-gap here, with no key.
const server = await import("../src/server/index.ts");

describe("key hand-added to auth.json after boot", () => {
	it("is in env by the time the turn builds its agent", async () => {
		server.writeSettingsRecord({
			version: 1,
			models: {
				strong: { model: { provider: "meta", id: "muse-spark-1.3" } },
				cheap: { model: { provider: "meta", id: "muse-spark-1.3-contributor" } },
				vision: { model: { provider: "meta", id: "muse-spark-1.3" } },
			},
		});
		const chat = server.createChat("Tides");

		// The hand-edit, after boot: the file has the key, env does not.
		fs.writeFileSync(AUTH, JSON.stringify({ META_API_KEY: "meta-test-not-a-real-key" }));
		assert.equal(process.env.META_API_KEY, undefined, "precondition: boot fill-gap already ran");

		let seenAtBuild: string | undefined | null = null;
		await server
			.handleChatInput(chat.id, { type: "text", text: "Why are there two tides a day?" }, () => {
				seenAtBuild = process.env.META_API_KEY;
				throw new Error("stop: the test only needs the build-time env");
			})
			.catch(() => {});
		assert.equal(seenAtBuild, "meta-test-not-a-real-key");
	});
});
