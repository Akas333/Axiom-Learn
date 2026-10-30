import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

// Hosted mode and the data seam must be set before any engine import.
const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "axiom-hosted-test-"));
process.env.LH_DATA_DIR = TMP_DATA;
process.env.KAPANY_HOSTED = "1";
process.env.META_API_KEY = "platform-meta-key-value";
after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

await import("../src/boot.ts"); // installs the per-user key view
const { createApp } = await import("../src/app.ts");
const { API_ROUTES } = await import("@axiom/engine/src/http/index.ts");
const { runAsTenant } = await import("@axiom/engine/tenant.ts");
const { quotaStatus } = await import("@axiom/engine/src/server/hosted.ts");
const { emit, subscribe } = await import("@axiom/engine/src/core/events.ts");
const { applyStripeEvent, planSink, verifyStripeSignature } = await import("../src/billing.ts");
const { parseProfileEdit } = await import("../src/profiles.ts");
const { SESSION_COOKIE } = await import("../src/auth.ts");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const TOKENS: Record<string, string> = { "token-a": USER_A, "token-b": USER_B };
const ORIGIN = "http://localhost";

const app = createApp(API_ROUTES, {
	auth: { supabaseUrl: "http://127.0.0.1:9", supabaseAnonKey: "anon", origins: [ORIGIN] },
	verify: async (token) => (TOKENS[token] ? { userId: TOKENS[token]!, email: `${token}@example.com` } : null),
	billing: null,
});

function call(url: string, token: string | null, init: RequestInit = {}) {
	const headers = new Headers(init.headers);
	if (token) headers.set("authorization", `Bearer ${token}`);
	if (init.method && init.method !== "GET") {
		headers.set("origin", headers.get("origin") ?? ORIGIN);
		headers.set("content-type", "application/json");
	}
	return app.request(url, { ...init, headers });
}

describe("hosted sign-in gate", () => {
	it("refuses the API without a session", async () => {
		const res = await call("/api/chats", null);
		assert.equal(res.status, 401);
		assert.equal(((await res.json()) as { code: string }).code, "auth_required");
	});

	it("refuses unknown tokens", async () => {
		assert.equal((await call("/api/chats", "forged")).status, 401);
	});

	it("refuses cross-site writes even with a valid session", async () => {
		const res = await call("/api/chats", "token-a", { method: "POST", body: "{}", headers: { origin: "https://evil.example" } });
		assert.equal(res.status, 403);
	});

	it("/auth/session turns a valid token into an HttpOnly cookie that authenticates", async () => {
		const res = await app.request("/auth/session", { method: "POST", headers: { authorization: "Bearer token-a", origin: ORIGIN } });
		assert.equal(res.status, 200);
		const cookie = res.headers.get("set-cookie") ?? "";
		assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=token-a`));
		assert.match(cookie, /HttpOnly/i);
		const listed = await app.request("/api/chats", { headers: { cookie: `${SESSION_COOKIE}=token-a` } });
		assert.equal(listed.status, 200);
	});

	it("keeps desktop-only routes off the hosted app", async () => {
		assert.equal((await call("/api/anki", "token-a")).status, 404);
		assert.equal((await call("/api/subscriptions", "token-a")).status, 404);
	});
});

describe("per-user data", () => {
	it("one user's sessions are invisible to another", async () => {
		const created = await call("/api/chats", "token-a", { method: "POST", body: JSON.stringify({ title: "A's lesson" }) });
		assert.equal(created.status, 200);
		const { id } = (await created.json()) as { id: string };

		const mine = ((await (await call("/api/chats", "token-a")).json()) as { chats: { id: string }[] }).chats;
		assert.ok(mine.some((c) => c.id === id));
		const theirs = ((await (await call("/api/chats", "token-b")).json()) as { chats: { id: string }[] }).chats;
		assert.ok(!theirs.some((c) => c.id === id));

		assert.equal((await call(`/api/chats/${id}`, "token-b")).status, 404);
		assert.equal((await call(`/api/chats/${id}/stream`, "token-b")).status, 404);
		assert.equal((await call(`/api/chats/${id}`, "token-a")).status, 200);
		assert.ok(fs.existsSync(path.join(TMP_DATA, "users", USER_A, "chats", `${id}.json`)));
	});

	it("live events reach only the user they belong to", () => {
		const seenByA: string[] = [];
		const off = runAsTenant({ userId: USER_A }, () => subscribe((e) => seenByA.push(e.type), USER_A));
		runAsTenant({ userId: USER_B }, () => emit("chats-changed", {}));
		runAsTenant({ userId: USER_A }, () => emit("activity-changed", {}));
		off();
		assert.deepEqual(seenByA, ["activity-changed"]);
	});
});

describe("per-user keys", () => {
	it("free users run on the platform key, without ever seeing it", async () => {
		const value = runAsTenant({ userId: USER_B }, () => process.env.META_API_KEY);
		assert.equal(value, "platform-meta-key-value");
		assert.equal(process.env.META_API_KEY, undefined, "no key outside a signed-in request");
		assert.ok(!("META_API_KEY" in { ...process.env }), "keys are never enumerated");
		const listed = await (await call("/api/keys", "token-b")).text();
		assert.ok(!listed.includes("platform-meta"), "the keys page never shows the platform key");
	});

	it("a user's own key replaces the platform key for them only", () => {
		const authFile = path.join(TMP_DATA, "users", USER_A, "auth.json");
		fs.mkdirSync(path.dirname(authFile), { recursive: true });
		fs.writeFileSync(authFile, JSON.stringify({ META_API_KEY: "a-own-key" }));
		assert.equal(runAsTenant({ userId: USER_A }, () => process.env.META_API_KEY), "a-own-key");
		assert.equal(runAsTenant({ userId: USER_B }, () => process.env.META_API_KEY), "platform-meta-key-value");
		assert.equal(runAsTenant({ userId: USER_A }, () => quotaStatus().ownKeys), true);
	});
});

describe("plans and quota", () => {
	it("blocks lessons on platform keys once the month's limit is used", async () => {
		process.env.KAPANY_FREE_TURNS = "0";
		try {
			const res = await call("/api/chat", "token-b", { method: "POST", body: JSON.stringify({ chatId: "x" }) });
			assert.equal(res.status, 402);
			assert.equal(((await res.json()) as { code: string }).code, "quota_exceeded");
		} finally {
			delete process.env.KAPANY_FREE_TURNS;
		}
	});

	it("verifies Stripe signatures", () => {
		const secret = "whsec_test";
		const payload = '{"type":"ping"}';
		const t = Math.floor(Date.now() / 1000);
		const sig = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
		assert.equal(verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret), true);
		assert.equal(verifyStripeSignature(payload, `t=${t},v1=${"0".repeat(64)}`, secret), false);
		assert.equal(verifyStripeSignature(payload, `t=${t - 3600},v1=${sig}`, secret), false, "old events are refused");
	});

	it("a completed checkout moves the user to Pro, and cancelling moves them back", async () => {
		const sink = planSink(null);
		await applyStripeEvent({ type: "checkout.session.completed", data: { object: { client_reference_id: USER_B, customer: "cus_1", subscription: "sub_1" } } }, sink);
		assert.equal(runAsTenant({ userId: USER_B }, () => quotaStatus().plan), "pro");
		await applyStripeEvent({ type: "customer.subscription.deleted", data: { object: { id: "sub_1", status: "canceled", metadata: { user_id: USER_B } } } }, sink);
		assert.equal(runAsTenant({ userId: USER_B }, () => quotaStatus().plan), "free");
	});
});

describe("profile edits", () => {
	it("accepts a name and an https picture, refuses the rest", () => {
		assert.deepEqual(parseProfileEdit({ display_name: "  Ada  " }), { ok: true, edit: { display_name: "Ada" } });
		assert.deepEqual(parseProfileEdit({ avatar_url: "" }), { ok: true, edit: { avatar_url: null } });
		assert.equal(parseProfileEdit({ avatar_url: "javascript:alert(1)" }).ok, false);
		assert.equal(parseProfileEdit({ display_name: "x".repeat(81) }).ok, false);
		assert.equal(parseProfileEdit({ plan: "pro" }).ok, false, "plan is not user-editable");
	});
});
