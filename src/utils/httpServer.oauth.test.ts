import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { SQLiteOAuthProvider } from "./oauthProvider.js";

process.env.OAUTH_DB_PATH = ":memory:";

let originalAllowInsecure: string | undefined;

beforeAll(() => {
	originalAllowInsecure = process.env.MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL;
	process.env.MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL = "true";
});

afterAll(() => {
	if (originalAllowInsecure === undefined) {
		delete process.env.MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL;
	} else {
		process.env.MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL =
			originalAllowInsecure;
	}
});

function makeApp() {
	const provider = new SQLiteOAuthProvider("http://localhost");
	const app = express();
	app.use(
		mcpAuthRouter({
			provider,
			issuerUrl: new URL("http://localhost"),
			resourceServerUrl: new URL("http://localhost/mcp"),
		}),
	);
	app.post("/mcp", requireBearerAuth({ verifier: provider }), (_req, res) => {
		res.json({ ok: true });
	});
	return app;
}

describe("OAuth HTTP server", () => {
	it("unauthenticated POST /mcp returns 401 with WWW-Authenticate: Bearer", async () => {
		const app = makeApp();
		const res = await request(app)
			.post("/mcp")
			.set("Content-Type", "application/json")
			.send("{}");
		expect(res.status).toBe(401);
		expect(res.headers["www-authenticate"]).toMatch(/^Bearer/i);
	});

	it("GET /.well-known/oauth-authorization-server returns 200 with JSON metadata", async () => {
		const app = makeApp();
		const res = await request(app).get(
			"/.well-known/oauth-authorization-server",
		);
		expect(res.status).toBe(200);
		expect(res.headers["content-type"]).toMatch(/json/);
		const body = res.body as Record<string, unknown>;
		expect(body.issuer).toBeTruthy();
		expect(body.authorization_endpoint).toBeTruthy();
		expect(body.token_endpoint).toBeTruthy();
	});
});
