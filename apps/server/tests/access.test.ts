import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { corsOrigins, hostedAccessAllowed } from "../src/access.ts";

const TOKEN = "t".repeat(40);
const env = { AXIOM_ACCESS_TOKEN: TOKEN };
const url = "https://api.example.test/api/chats";

describe("hosted access gate", () => {
	it("is open when no token is configured (local dev)", () => {
		assert.equal(hostedAccessAllowed(new Headers(), url, {}), true);
	});

	it("accepts the bearer token", () => {
		const h = new Headers({ Authorization: `Bearer ${TOKEN}` });
		assert.equal(hostedAccessAllowed(h, url, env), true);
	});

	it("accepts the access_token query parameter", () => {
		assert.equal(hostedAccessAllowed(new Headers(), `${url}?access_token=${TOKEN}`, env), true);
	});

	it("rejects a missing or wrong token", () => {
		assert.equal(hostedAccessAllowed(new Headers(), url, env), false);
		const wrong = new Headers({ Authorization: `Bearer ${"x".repeat(40)}` });
		assert.equal(hostedAccessAllowed(wrong, url, env), false);
		const short = new Headers({ Authorization: "Bearer t" });
		assert.equal(hostedAccessAllowed(short, url, env), false);
	});
});

describe("cors origins", () => {
	it("parses a comma-separated list", () => {
		assert.deepEqual(corsOrigins({ AXIOM_CORS_ORIGINS: "https://a.test, https://b.test ," }), ["https://a.test", "https://b.test"]);
		assert.deepEqual(corsOrigins({}), []);
	});
});
