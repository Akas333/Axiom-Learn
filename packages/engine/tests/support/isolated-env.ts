/**
 * Test preload (`--import`): runs in every test process BEFORE any test or
 * engine module loads, so config.ts can never resolve the real developer
 * data dir or key file.
 *
 * Why a preload and not per-file setup: config.ts reads LH_DATA_DIR /
 * LH_AUTH_FILE once, at import time, and static imports are evaluated
 * before a test file's own body runs — a file that sets the env after its
 * imports (or forgets to) wrote sessions and jobs into packages/engine/data.
 *
 * Tests that set their own LH_DATA_DIR / LH_AUTH_FILE still win: they
 * overwrite these values before their dynamic config imports.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axiom-test-"));
process.env.LH_DATA_DIR ??= path.join(dir, "data");
process.env.LH_AUTH_FILE ??= path.join(dir, "auth.json");
process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
