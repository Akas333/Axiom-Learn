/**
 * The data bundle (2026-10-30): one encrypted file that carries a learner's
 * data folder to another machine. Pure (no filesystem): server/data-transfer.ts
 * collects and writes the files.
 *
 * Layout of a .tysa file:
 *   "KAPANYB1" | u32 header length | header JSON | ciphertext | 16-byte GCM tag
 * The header (format, scrypt cost, salt, iv) is in the clear but bound to the
 * ciphertext as AES-GCM additional data, so editing it fails decryption.
 * The plaintext is gzip of:
 *   "KPFILES1" | u32 count | per file: u16 path length | path | u64 size | bytes
 *
 * A wrong passphrase and a damaged file look the same (the tag check fails),
 * and both throw BundleError.
 */
import crypto from "node:crypto";
import zlib from "node:zlib";

const MAGIC = Buffer.from("KAPANYB1");
const FILES_MAGIC = Buffer.from("KPFILES1");
export const BUNDLE_EXTENSION = ".tysa";
export const MIN_PASSPHRASE_LENGTH = 8;

/** scrypt cost: 2^17 × r 8 uses 128 MB and about half a second. */
const DEFAULT_SCRYPT = { N: 2 ** 17, r: 8, p: 1 };

export interface BundleFile {
	/** Path relative to the data folder, "/"-separated. */
	path: string;
	data: Buffer;
}

interface BundleHeader {
	format: 1;
	kdf: "scrypt";
	N: number;
	r: number;
	p: number;
	salt: string;
	iv: string;
	createdAt: string;
}

export class BundleError extends Error {
	constructor(
		message: string,
		readonly code: "bad_passphrase" | "not_a_bundle" | "unsafe_path",
	) {
		super(message);
		this.name = "BundleError";
	}
}

/** A path is safe when it stays inside the data folder: relative, "/"-only,
 *  no empty, "." or ".." segments, no drive letters or NUL bytes. */
export function isSafeBundlePath(p: string): boolean {
	if (!p || p.length > 1024 || p.includes("\\") || p.includes("\0") || p.startsWith("/")) return false;
	if (/^[A-Za-z]:/.test(p)) return false;
	return p.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

function deriveKey(passphrase: string, salt: Buffer, cost: { N: number; r: number; p: number }): Buffer {
	return crypto.scryptSync(passphrase.normalize("NFC"), salt, 32, { ...cost, maxmem: 256 * cost.N * cost.r + 1024 * 1024 });
}

function packFiles(files: readonly BundleFile[]): Buffer {
	const parts: Buffer[] = [FILES_MAGIC];
	const count = Buffer.alloc(4);
	count.writeUInt32BE(files.length);
	parts.push(count);
	for (const file of files) {
		if (!isSafeBundlePath(file.path)) throw new BundleError(`Unsafe path in bundle: ${file.path}`, "unsafe_path");
		const name = Buffer.from(file.path, "utf-8");
		const head = Buffer.alloc(2 + name.length + 8);
		head.writeUInt16BE(name.length, 0);
		name.copy(head, 2);
		head.writeBigUInt64BE(BigInt(file.data.length), 2 + name.length);
		parts.push(head, file.data);
	}
	return Buffer.concat(parts);
}

function unpackFiles(buf: Buffer): BundleFile[] {
	const fail = () => new BundleError("The bundle's contents are damaged.", "not_a_bundle");
	if (buf.length < 12 || !buf.subarray(0, 8).equals(FILES_MAGIC)) throw fail();
	const count = buf.readUInt32BE(8);
	const files: BundleFile[] = [];
	const seen = new Set<string>();
	let at = 12;
	for (let i = 0; i < count; i++) {
		if (at + 2 > buf.length) throw fail();
		const nameLen = buf.readUInt16BE(at);
		at += 2;
		if (at + nameLen + 8 > buf.length) throw fail();
		const name = buf.subarray(at, at + nameLen).toString("utf-8");
		at += nameLen;
		const size = Number(buf.readBigUInt64BE(at));
		at += 8;
		if (at + size > buf.length) throw fail();
		if (!isSafeBundlePath(name) || seen.has(name)) throw new BundleError(`Unsafe path in bundle: ${name}`, "unsafe_path");
		seen.add(name);
		files.push({ path: name, data: Buffer.from(buf.subarray(at, at + size)) });
		at += size;
	}
	if (at !== buf.length) throw fail();
	return files;
}

/** Pack and encrypt `files` with `passphrase`. `cost` is for tests only. */
export function sealBundle(files: readonly BundleFile[], passphrase: string, cost = DEFAULT_SCRYPT): Buffer {
	if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
		throw new BundleError(`Use a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters.`, "bad_passphrase");
	}
	const salt = crypto.randomBytes(16);
	const iv = crypto.randomBytes(12);
	const header: BundleHeader = {
		format: 1,
		kdf: "scrypt",
		...cost,
		salt: salt.toString("base64"),
		iv: iv.toString("base64"),
		createdAt: new Date().toISOString(),
	};
	const headerBuf = Buffer.from(JSON.stringify(header), "utf-8");
	const headerLen = Buffer.alloc(4);
	headerLen.writeUInt32BE(headerBuf.length);
	const prefix = Buffer.concat([MAGIC, headerLen, headerBuf]);

	const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(passphrase, salt, cost), iv);
	cipher.setAAD(prefix);
	const body = Buffer.concat([cipher.update(zlib.gzipSync(packFiles(files))), cipher.final()]);
	return Buffer.concat([prefix, body, cipher.getAuthTag()]);
}

/** Decrypt and unpack a bundle. Throws BundleError on a wrong passphrase,
 *  a damaged or edited file, or a path that would leave the data folder. */
export function openBundle(bundle: Buffer, passphrase: string): { files: BundleFile[]; createdAt: string } {
	const notBundle = () => new BundleError("This isn't a TYSA data file.", "not_a_bundle");
	if (bundle.length < MAGIC.length + 4 + 16 || !bundle.subarray(0, MAGIC.length).equals(MAGIC)) throw notBundle();
	const headerLen = bundle.readUInt32BE(MAGIC.length);
	const headerEnd = MAGIC.length + 4 + headerLen;
	if (headerLen > 4096 || headerEnd + 16 > bundle.length) throw notBundle();
	let header: BundleHeader;
	try {
		header = JSON.parse(bundle.subarray(MAGIC.length + 4, headerEnd).toString("utf-8")) as BundleHeader;
	} catch {
		throw notBundle();
	}
	const costOk =
		header.format === 1 &&
		header.kdf === "scrypt" &&
		Number.isInteger(header.N) && header.N >= 2 ** 10 && header.N <= 2 ** 20 && (header.N & (header.N - 1)) === 0 &&
		Number.isInteger(header.r) && header.r >= 1 && header.r <= 16 &&
		Number.isInteger(header.p) && header.p >= 1 && header.p <= 4;
	if (!costOk || typeof header.salt !== "string" || typeof header.iv !== "string") throw notBundle();

	const salt = Buffer.from(header.salt, "base64");
	const iv = Buffer.from(header.iv, "base64");
	if (iv.length !== 12 || salt.length < 16) throw notBundle();
	const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(passphrase, salt, header), iv);
	decipher.setAAD(bundle.subarray(0, headerEnd));
	decipher.setAuthTag(bundle.subarray(bundle.length - 16));
	let packed: Buffer;
	try {
		const zipped = Buffer.concat([decipher.update(bundle.subarray(headerEnd, bundle.length - 16)), decipher.final()]);
		packed = zlib.gunzipSync(zipped);
	} catch {
		throw new BundleError("Wrong passphrase, or the file is damaged.", "bad_passphrase");
	}
	return { files: unpackFiles(packed), createdAt: header.createdAt };
}
