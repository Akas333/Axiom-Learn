/**
 * DATA EXPORT AND IMPORT (2026-10-30): the encrypted .tysa bundle
 * (core/data-bundle.ts) and the data-folder export/import around it
 * (server/data-transfer.ts).
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { afterEach, beforeEach, describe, it } from "node:test";

import { BundleError, isSafeBundlePath, openBundle, sealBundle, type BundleFile } from "../src/core/data-bundle.ts";
import { BACKUPS_DIR, collectDataFiles, importData } from "../src/server/data-transfer.ts";

/** Cheap scrypt so the suite stays fast; real exports use 2^17. */
const FAST = { N: 2 ** 10, r: 8, p: 1 };
const PASS = "correct horse battery";

function write(root: string, rel: string, text: string): void {
	const file = path.join(root, rel);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, text);
}

function read(root: string, rel: string): string {
	return fs.readFileSync(path.join(root, rel), "utf-8");
}

describe("data bundle", () => {
	const files: BundleFile[] = [
		{ path: "settings.json", data: Buffer.from('{"version":3}') },
		{ path: "chats/chat_a.json", data: Buffer.from('{"id":"chat_a"}') },
		{ path: "materials/m1/original.pdf", data: Buffer.from([0, 1, 2, 255]) },
		{ path: "graph/empty.jsonl", data: Buffer.alloc(0) },
	];

	it("round-trips files byte for byte", () => {
		const opened = openBundle(sealBundle(files, PASS, FAST), PASS);
		assert.deepEqual(
			opened.files.map((f) => [f.path, f.data.toString("hex")]),
			files.map((f) => [f.path, f.data.toString("hex")]),
		);
		assert.ok(!Number.isNaN(Date.parse(opened.createdAt)));
	});

	it("does not contain the contents in the clear", () => {
		const bundle = sealBundle([{ path: "chats/secret.json", data: Buffer.from("my private notes") }], PASS, FAST);
		assert.equal(bundle.includes(Buffer.from("my private notes")), false);
		assert.equal(bundle.includes(Buffer.from("secret.json")), false);
	});

	it("rejects a wrong passphrase", () => {
		const bundle = sealBundle(files, PASS, FAST);
		assert.throws(() => openBundle(bundle, "wrong passphrase"), (err: unknown) => err instanceof BundleError && err.code === "bad_passphrase");
	});

	it("rejects an edited body or header", () => {
		const bundle = sealBundle(files, PASS, FAST);
		const body = Buffer.from(bundle);
		body.writeUInt8(body.readUInt8(body.length - 20) ^ 1, body.length - 20);
		assert.throws(() => openBundle(body, PASS), BundleError);

		// Changing the header's createdAt (still valid JSON) breaks the tag.
		const header = Buffer.from(bundle.toString("latin1").replace(/"createdAt":"\d/, (m) => m.slice(0, -1) + "9"), "latin1");
		assert.throws(() => openBundle(header, PASS), BundleError);
	});

	it("rejects files that are not bundles", () => {
		assert.throws(() => openBundle(Buffer.from("hello world, not a bundle at all"), PASS), (err: unknown) => err instanceof BundleError && err.code === "not_a_bundle");
	});

	it("refuses short passphrases", () => {
		assert.throws(() => sealBundle(files, "short", FAST), BundleError);
	});

	it("only accepts paths inside the data folder", () => {
		for (const ok of ["settings.json", "chats/a.json", "materials/m1/original.pdf"]) assert.ok(isSafeBundlePath(ok), ok);
		for (const bad of ["", "/etc/passwd", "../x", "a/../../x", "a//b", "./a", "a\\b", "C:/x", "a\0b"]) assert.ok(!isSafeBundlePath(bad), bad);
		assert.throws(() => sealBundle([{ path: "../escape", data: Buffer.alloc(1) }], PASS, FAST), BundleError);
	});

	it("rejects a bundle whose packed paths escape the folder", () => {
		// Hand-build an inner payload with a "../" path and seal it the same way.
		const name = Buffer.from("../escape.txt");
		const head = Buffer.alloc(2 + name.length + 8);
		head.writeUInt16BE(name.length, 0);
		name.copy(head, 2);
		head.writeBigUInt64BE(1n, 2 + name.length);
		const count = Buffer.alloc(4);
		count.writeUInt32BE(1);
		const packed = Buffer.concat([Buffer.from("KPFILES1"), count, head, Buffer.from("x")]);
		const good = sealBundle([{ path: "a", data: Buffer.from("x") }], PASS, FAST);
		const evil = resealWith(good, zlib.gzipSync(packed));
		assert.throws(() => openBundle(evil, PASS), (err: unknown) => err instanceof BundleError && err.code === "unsafe_path");
	});
});

/** Re-encrypt `plaintext` under `bundle`'s own header and key. */
function resealWith(bundle: Buffer, plaintext: Buffer): Buffer {
	const headerLen = bundle.readUInt32BE(8);
	const prefix = bundle.subarray(0, 12 + headerLen);
	const header = JSON.parse(bundle.subarray(12, 12 + headerLen).toString()) as { salt: string; iv: string; N: number; r: number; p: number };
	const key = crypto.scryptSync(PASS, Buffer.from(header.salt, "base64"), 32, { N: header.N, r: header.r, p: header.p });
	const cipher = crypto.createCipheriv("aes-256-gcm", key, Buffer.from(header.iv, "base64"));
	cipher.setAAD(prefix);
	const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	return Buffer.concat([prefix, body, cipher.getAuthTag()]);
}

describe("data folder export and import", () => {
	let tmp: string;
	let src: string;
	let dest: string;

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kapany-transfer-"));
		src = path.join(tmp, "src");
		dest = path.join(tmp, "dest");
		write(src, "settings.json", '{"version":3}');
		write(src, "folders.json", "[]");
		write(src, "chats/chat_a.json", '{"id":"chat_a"}');
		write(src, "graph/nodes.jsonl", '{"id":"n1"}\n');
		write(src, "materials/m1/original.pdf", "%PDF");
		write(src, "prompts/teacher/10-voice.md", "be kind");
		// Never exported:
		write(src, "auth.json", '{"META_API_KEY":"secret"}');
		write(src, "chatgpt-credentials.json", "{}");
		write(src, "chats/chat_b.json.123.tmp", "half-written");
		write(src, "debug/provider-events/chat_a.jsonl", "{}");
		write(src, "question-bank/jee/questions.jsonl", "{}");
		write(src, `${BACKUPS_DIR}/old/settings.json`, "{}");
	});

	afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

	it("exports the learner's records and nothing secret or shared", () => {
		assert.deepEqual(
			collectDataFiles(src).map((f) => f.path),
			["chats/chat_a.json", "folders.json", "graph/nodes.jsonl", "materials/m1/original.pdf", "prompts/teacher/10-voice.md", "settings.json"],
		);
	});

	it("imports into an empty folder", () => {
		const result = importData(sealBundle(collectDataFiles(src), PASS, FAST), PASS, dest);
		assert.equal(result.backup, null);
		assert.equal(result.chats, 1);
		assert.equal(result.materials, 1);
		assert.equal(read(dest, "chats/chat_a.json"), '{"id":"chat_a"}');
		assert.equal(read(dest, "materials/m1/original.pdf"), "%PDF");
		assert.equal(fs.existsSync(path.join(dest, "auth.json")), false);
	});

	it("moves the previous data to a backup and keeps the question bank", () => {
		write(dest, "chats/chat_old.json", "old");
		write(dest, "settings.json", "old settings");
		write(dest, "question-bank/local/questions.jsonl", "bank");
		const result = importData(sealBundle(collectDataFiles(src), PASS, FAST), PASS, dest, new Date("2026-10-30T12:00:00.000Z"));

		assert.equal(result.backup, `${BACKUPS_DIR}/2026-10-30T12-00-00-000Z`);
		assert.equal(read(dest, "settings.json"), '{"version":3}');
		assert.equal(fs.existsSync(path.join(dest, "chats/chat_old.json")), false);
		assert.equal(read(dest, `${result.backup}/chats/chat_old.json`), "old");
		assert.equal(read(dest, `${result.backup}/settings.json`), "old settings");
		assert.equal(read(dest, "question-bank/local/questions.jsonl"), "bank");
	});

	it("changes nothing on a wrong passphrase", () => {
		write(dest, "settings.json", "mine");
		assert.throws(() => importData(sealBundle(collectDataFiles(src), PASS, FAST), "not the passphrase", dest), BundleError);
		assert.deepEqual(fs.readdirSync(dest), ["settings.json"]);
		assert.equal(read(dest, "settings.json"), "mine");
	});

	it("refuses a bundle that writes into the backups or question bank", () => {
		write(dest, "settings.json", "mine");
		for (const reserved of [`${BACKUPS_DIR}/x.json`, "question-bank/x/questions.jsonl"]) {
			const bundle = sealBundle([{ path: reserved, data: Buffer.from("x") }], PASS, FAST);
			assert.throws(() => importData(bundle, PASS, dest), BundleError);
		}
		assert.deepEqual(fs.readdirSync(dest), ["settings.json"]);
	});
});
