import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { SQLiteOAuthProvider } from "./oauthProvider.js";
import { createConsentRouter } from "./consent.js";

process.env.OAUTH_DB_PATH = ":memory:";

function makeApp(provider: SQLiteOAuthProvider) {
	const app = express();
	app.use(createConsentRouter(provider, "Test Auth"));
	return app;
}

function makeClient(): OAuthClientInformationFull {
	return {
		client_id: "test-client",
		client_id_issued_at: Math.floor(Date.now() / 1000),
		redirect_uris: ["https://client.example.com/callback"],
	};
}

async function seedSession(provider: SQLiteOAuthProvider): Promise<string> {
	const client = makeClient();
	const params = {
		codeChallenge: "challenge",
		redirectUri: "https://client.example.com/callback",
		state: "mystate",
		scopes: ["mcp"],
	};
	let sessionId = "";
	const mockRes = {
		redirect: (url: string) => {
			sessionId = new URL(url).searchParams.get("session") ?? "";
		},
	} as unknown as import("express").Response;
	await provider.authorize(client, params, mockRes);
	return sessionId;
}

describe("GET /consent", () => {
	it("renders form with session id", async () => {
		const provider = new SQLiteOAuthProvider("https://example.com");
		const app = makeApp(provider);
		const sessionId = await seedSession(provider);
		const res = await request(app).get(`/consent?session=${sessionId}`);
		expect(res.status).toBe(200);
		expect(res.text).toContain(sessionId);
		expect(res.text).toContain("<form");
	});

	it("missing session returns 400", async () => {
		const provider = new SQLiteOAuthProvider("https://example.com");
		const app = makeApp(provider);
		const res = await request(app).get("/consent");
		expect(res.status).toBe(400);
	});
});

describe("POST /consent", () => {
	beforeEach(() => {
		process.env.MCP_AUTH_PASSWORD = "correct-password";
	});

	afterEach(() => {
		delete process.env.MCP_AUTH_PASSWORD;
	});

	it("correct password redirects with code and state", async () => {
		const provider = new SQLiteOAuthProvider("https://example.com");
		const app = makeApp(provider);
		const sessionId = await seedSession(provider);

		const res = await request(app)
			.post("/consent")
			.type("form")
			.send({ session: sessionId, password: "correct-password" });

		expect(res.status).toBe(302);
		const location = new URL(res.headers["location"]);
		expect(location.searchParams.get("code")).toBeTruthy();
		expect(location.searchParams.get("state")).toBe("mystate");
	});

	it("wrong password returns 200 with error", async () => {
		const provider = new SQLiteOAuthProvider("https://example.com");
		const app = makeApp(provider);
		const sessionId = await seedSession(provider);

		const res = await request(app)
			.post("/consent")
			.type("form")
			.send({ session: sessionId, password: "wrong" });

		expect(res.status).toBe(200);
		expect(res.text).toContain("Incorrect password");
	});

	it("empty MCP_AUTH_PASSWORD rejects all passwords", async () => {
		process.env.MCP_AUTH_PASSWORD = "";
		const provider = new SQLiteOAuthProvider("https://example.com");
		const app = makeApp(provider);
		const sessionId = await seedSession(provider);

		const res = await request(app)
			.post("/consent")
			.type("form")
			.send({ session: sessionId, password: "anything" });

		expect(res.status).toBe(200);
		expect(res.text).toContain("Incorrect password");
	});

	it("consumed session returns 400", async () => {
		const provider = new SQLiteOAuthProvider("https://example.com");
		const app = makeApp(provider);
		const sessionId = await seedSession(provider);

		// First consume the session
		await request(app)
			.post("/consent")
			.type("form")
			.send({ session: sessionId, password: "correct-password" });

		// Second request with same session
		const res = await request(app)
			.post("/consent")
			.type("form")
			.send({ session: sessionId, password: "correct-password" });

		expect(res.status).toBe(400);
		expect(res.text).toContain("Session expired");
	});
});
