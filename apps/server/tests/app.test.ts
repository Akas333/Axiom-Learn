import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

// The data seam must be set before any engine import reads config.
const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "axiom-server-test-"));
process.env.LH_DATA_DIR = TMP_DATA;
after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

const { createApp } = await import("../src/app.ts");
const { API_ROUTES } = await import("@axiom/engine/src/http/index.ts");
type ApiRoute = (typeof API_ROUTES)[number];

/** A concrete URL for a route pattern, plus the params the handler should see. */
function sample(route: ApiRoute): { url: string; params: Record<string, string | string[]> } {
	const params: Record<string, string | string[]> = {};
	const url = route.path
		.split("/")
		.map((seg) => {
			if (seg.startsWith(":")) {
				params[seg.slice(1)] = `v-${seg.slice(1)}`;
				return `v-${seg.slice(1)}`;
			}
			if (seg === "*") {
				params[route.catchAll!] = ["a", "b%20c"];
				return "a/b%20c";
			}
			return seg;
		})
		.join("/");
	return { url, params };
}

describe("route mounting", () => {
	// Echo handlers on the real route table: every method of every route must
	// reach its own handler with the right params (no shadowing, nothing lost).
	const echoRoutes: ApiRoute[] = API_ROUTES.map((route) => ({
		...route,
		handlers: Object.fromEntries(
			Object.keys(route.handlers).map((method) => [
				method,
				async (_req: Request, ctx: { params: Promise<Record<string, string | string[]>> }) =>
					Response.json({ path: route.path, method, params: await ctx.params }),
			]),
		),
	}));
	const app = createApp(echoRoutes);

	it("mounts all 45 engine routes", () => {
		assert.equal(API_ROUTES.length, 45);
	});

	for (const route of API_ROUTES) {
		for (const method of Object.keys(route.handlers)) {
			it(`${method} ${route.path}`, async () => {
				const { url, params } = sample(route);
				const res = await app.request(url, { method });
				assert.equal(res.status, 200);
				assert.deepEqual(await res.json(), { path: route.path, method, params });
			});
		}
	}

	it("returns JSON 404 for unknown API paths", async () => {
		const res = await app.request("/api/does-not-exist");
		assert.equal(res.status, 404);
		assert.deepEqual(await res.json(), { error: "Not found" });
	});
});

describe("engine handlers over HTTP", () => {
	const app = createApp();

	it("GET /api/chats lists sessions from the data dir", async () => {
		const res = await app.request("/api/chats");
		assert.equal(res.status, 200);
		assert.deepEqual(await res.json(), { chats: [] });
	});

	it("POST /api/chats creates a session that GET /api/chats/:id returns", async () => {
		const created = await app.request("/api/chats", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ title: "Why does the moon cause tides?" }),
		});
		assert.equal(created.status, 200);
		const { id } = (await created.json()) as { id: string };
		const res = await app.request(`/api/chats/${id}`);
		assert.equal(res.status, 200);
		const chat = (await res.json()) as { id: string; turnInFlight: boolean };
		assert.equal(chat.id, id);
		assert.equal(chat.turnInFlight, false);
	});

	it("GET /api/chats/:id is 404 for an unknown session", async () => {
		const res = await app.request("/api/chats/chat_missing");
		assert.equal(res.status, 404);
	});

	it("GET /api/settings and /api/keys answer", async () => {
		assert.equal((await app.request("/api/settings")).status, 200);
		const keys = (await (await app.request("/api/keys")).json()) as { providers: { id: string }[] };
		assert.ok(keys.providers.some((p) => p.id === "meta"), "Meta is a key-able provider");
	});
});
