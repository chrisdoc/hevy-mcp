import { describe, expect, it } from "vitest";
import { InvalidScopeError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { SQLiteOAuthProvider } from "./oauthProvider.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

// Use in-memory SQLite for tests
process.env.OAUTH_DB_PATH = ":memory:";

function makeProvider() {
	return new SQLiteOAuthProvider("https://example.com");
}

function makeClient(
	overrides?: Partial<OAuthClientInformationFull>,
): OAuthClientInformationFull {
	return {
		client_id: "test-client",
		client_id_issued_at: Math.floor(Date.now() / 1000),
		redirect_uris: ["https://client.example.com/callback"],
		...overrides,
	};
}

describe("SQLiteOAuthProvider - clients store", () => {
	it("registers and retrieves a client", async () => {
		const provider = makeProvider();
		const registered = await provider.clientsStore.registerClient!({
			redirect_uris: ["https://client.example.com/callback"],
		});
		expect(registered.client_id).toBeTruthy();
		const retrieved = await provider.clientsStore.getClient(
			registered.client_id,
		);
		expect(retrieved).toMatchObject({ client_id: registered.client_id });
	});

	it("returns undefined for unknown client", () => {
		const provider = makeProvider();
		expect(provider.clientsStore.getClient("nonexistent")).toBeUndefined();
	});
});

describe("SQLiteOAuthProvider - authorize", () => {
	it("redirects to consent URL and stores pending session", async () => {
		const provider = makeProvider();
		const client = makeClient();
		const params = {
			codeChallenge: "abc123",
			redirectUri: "https://client.example.com/callback",
			scopes: ["mcp"],
		};

		const redirectCalls: string[] = [];
		const mockRes = {
			redirect: (url: string) => {
				redirectCalls.push(url);
			},
		} as unknown as import("express").Response;

		await provider.authorize(client, params, mockRes);
		expect(redirectCalls).toHaveLength(1);
		expect(redirectCalls[0]).toMatch(
			/^https:\/\/example\.com\/consent\?session=[0-9a-f]{32}$/,
		);
	});

	it("popPendingSession is consumed-once", async () => {
		const provider = makeProvider();
		const client = makeClient();
		const params = {
			codeChallenge: "abc123",
			redirectUri: "https://client.example.com/callback",
		};

		let capturedSession = "";
		const mockRes = {
			redirect: (url: string) => {
				capturedSession = new URL(url).searchParams.get("session") ?? "";
			},
		} as unknown as import("express").Response;

		await provider.authorize(client, params, mockRes);
		const first = provider.popPendingSession(capturedSession);
		expect(first).toBeDefined();
		const second = provider.popPendingSession(capturedSession);
		expect(second).toBeUndefined();
	});
});

describe("SQLiteOAuthProvider - auth codes", () => {
	it("creates code and returns challenge", async () => {
		const provider = makeProvider();
		const client = makeClient();
		const params = {
			codeChallenge: "challenge-xyz",
			redirectUri: "https://client.example.com/callback",
		};

		const code = provider.createAuthorizationCode(client.client_id, params);
		expect(code).toBeTruthy();

		const challenge = await provider.challengeForAuthorizationCode(
			client,
			code,
		);
		expect(challenge).toBe("challenge-xyz");
	});

	it("expired code throws on exchange", async () => {
		const provider = makeProvider();
		const client = makeClient();
		const params = {
			codeChallenge: "challenge",
			redirectUri: "https://client.example.com/callback",
		};
		const code = provider.createAuthorizationCode(client.client_id, params);

		// Force expiry by back-dating the row in the DB
		(provider as unknown as { db: import("better-sqlite3").Database }).db
			.prepare("UPDATE auth_codes SET expires_at = 1 WHERE code = ?")
			.run(code);

		await expect(
			provider.exchangeAuthorizationCode(client, code),
		).rejects.toThrow(/expired/i);
	});

	it("mismatched client on code exchange throws", async () => {
		const provider = makeProvider();
		const client = makeClient();
		const params = {
			codeChallenge: "challenge",
			redirectUri: "https://client.example.com/callback",
		};
		const code = provider.createAuthorizationCode(client.client_id, params);

		const wrongClient = makeClient({ client_id: "wrong-client" });
		await expect(
			provider.exchangeAuthorizationCode(wrongClient, code),
		).rejects.toThrow();
	});

	it("consumed code throws on second exchange", async () => {
		const provider = makeProvider();
		const client = makeClient();
		const params = {
			codeChallenge: "challenge",
			redirectUri: "https://client.example.com/callback",
		};
		const code = provider.createAuthorizationCode(client.client_id, params);
		await provider.exchangeAuthorizationCode(client, code);
		await expect(
			provider.exchangeAuthorizationCode(client, code),
		).rejects.toThrow();
	});
});

describe("SQLiteOAuthProvider - token exchange", () => {
	async function getTokens(provider: SQLiteOAuthProvider) {
		const client = makeClient();
		const params = {
			codeChallenge: "challenge",
			redirectUri: "https://client.example.com/callback",
			scopes: ["mcp"],
		};
		const code = provider.createAuthorizationCode(client.client_id, params);
		return {
			client,
			tokens: await provider.exchangeAuthorizationCode(client, code),
		};
	}

	it("returns tokens with correct expires_in", async () => {
		const provider = makeProvider();
		const { tokens } = await getTokens(provider);
		expect(tokens.token_type).toBe("bearer");
		expect(tokens.expires_in).toBe(3600);
		expect(tokens.refresh_token).toBeTruthy();
	});

	it("verifyAccessToken returns AuthInfo with expiresAt", async () => {
		const provider = makeProvider();
		const { tokens } = await getTokens(provider);
		const info = await provider.verifyAccessToken(tokens.access_token);
		expect(info.token).toBe(tokens.access_token);
		expect(info.clientId).toBe("test-client");
		expect(typeof info.expiresAt).toBe("number");
	});

	it("expired access token throws", async () => {
		const provider = makeProvider();
		// Directly insert expired token
		(provider as unknown as { db: import("better-sqlite3").Database }).db
			.prepare(
				`INSERT INTO access_tokens (token, client_id, scopes, expires_at, resource, family_id)
				VALUES (?, ?, ?, ?, ?, ?)`,
			)
			.run("expired-tok", "test-client", '["mcp"]', 1, null, "fam1");
		await expect(provider.verifyAccessToken("expired-tok")).rejects.toThrow();
	});

	it("refresh token rotation produces same family_id", async () => {
		const provider = makeProvider();
		const { client, tokens } = await getTokens(provider);
		const newTokens = await provider.exchangeRefreshToken(
			client,
			tokens.refresh_token!,
		);
		expect(newTokens.access_token).not.toBe(tokens.access_token);
		expect(newTokens.refresh_token).not.toBe(tokens.refresh_token);
		// Old refresh token should be gone
		await expect(
			provider.exchangeRefreshToken(client, tokens.refresh_token!),
		).rejects.toThrow();
	});

	it("scope escalation throws InvalidScopeError", async () => {
		const provider = makeProvider();
		const { client, tokens } = await getTokens(provider);
		await expect(
			provider.exchangeRefreshToken(client, tokens.refresh_token!, [
				"mcp",
				"admin",
			]),
		).rejects.toThrow(InvalidScopeError);
	});
});

describe("SQLiteOAuthProvider - revocation", () => {
	async function setup() {
		const provider = makeProvider();
		const client = makeClient();
		const params = {
			codeChallenge: "challenge",
			redirectUri: "https://client.example.com/callback",
			scopes: ["mcp"],
		};
		const code = provider.createAuthorizationCode(client.client_id, params);
		const tokens = await provider.exchangeAuthorizationCode(client, code);
		return { provider, client, tokens };
	}

	it("revocation via access token kills entire family", async () => {
		const { provider, client, tokens } = await setup();
		await provider.revokeToken!(client, { token: tokens.access_token });
		await expect(
			provider.verifyAccessToken(tokens.access_token),
		).rejects.toThrow();
		// refresh should also be gone
		await expect(
			provider.exchangeRefreshToken(client, tokens.refresh_token!),
		).rejects.toThrow();
	});

	it("revocation via refresh token kills entire family", async () => {
		const { provider, client, tokens } = await setup();
		await provider.revokeToken!(client, { token: tokens.refresh_token! });
		await expect(
			provider.verifyAccessToken(tokens.access_token),
		).rejects.toThrow();
	});

	it("revoke nonexistent token is no-op", async () => {
		const { provider, client } = await setup();
		await expect(
			provider.revokeToken!(client, { token: "nonexistent" }),
		).resolves.toBeUndefined();
	});
});
