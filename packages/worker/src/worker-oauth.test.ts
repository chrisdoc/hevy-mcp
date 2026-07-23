import type {
	AuthRequest,
	OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HevyHttpError } from "@hevy-mcp/hevy-client";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import {
	decodeAuthRequest,
	encodeAuthRequest,
	handleAuthorizeGet,
	handleAuthorizePost,
	hasOAuthAccessTokenShape,
	renderAuthorizePage,
	type HevyOAuthDependencies,
} from "./worker-oauth.js";
import { createWorkerFetchHandler } from "./worker.js";

afterEach(() => {
	vi.restoreAllMocks();
});

function createMockClient(overrides: Partial<HevyClient> = {}): HevyClient {
	return {
		getUserInfo: vi.fn().mockResolvedValue({ data: { id: "user" } }),
		...overrides,
	} as HevyClient;
}

const sampleAuthRequest: AuthRequest = {
	responseType: "code",
	clientId: "client-123",
	redirectUri: "https://claude.ai/api/mcp/auth_callback",
	scope: [],
	state: "state-xyz",
	codeChallenge: "challenge",
	codeChallengeMethod: "S256",
};

type FakeHelpers = Pick<
	OAuthHelpers,
	"parseAuthRequest" | "lookupClient" | "completeAuthorization"
>;

function createFakeHelpers(overrides: Partial<FakeHelpers> = {}): OAuthHelpers {
	const helpers: FakeHelpers = {
		parseAuthRequest: vi.fn().mockResolvedValue(sampleAuthRequest),
		lookupClient: vi.fn().mockResolvedValue({
			clientId: "client-123",
			clientName: "Claude",
			redirectUris: [sampleAuthRequest.redirectUri],
			tokenEndpointAuthMethod: "none",
		}),
		completeAuthorization: vi.fn().mockResolvedValue({
			redirectTo: `${sampleAuthRequest.redirectUri}?code=abc&state=state-xyz`,
		}),
		...overrides,
	};
	return helpers as OAuthHelpers;
}

function createDependencies(
	overrides: Partial<HevyOAuthDependencies<object>> = {},
): HevyOAuthDependencies<object> {
	return {
		validateApiKey: vi.fn().mockResolvedValue("valid"),
		serveMcp: vi.fn().mockResolvedValue(new Response("ok")),
		...overrides,
	};
}

function authorizePostRequest(fields: Record<string, string>): Request {
	return new Request("https://worker.example/authorize", {
		method: "POST",
		body: new URLSearchParams(fields),
	});
}

describe("OAuth helpers", () => {
	it.each([
		["3f2c8a9e-1b7d-4c6a-9e2f-abc123def456", false],
		["plain-api-key", false],
		["user:grant:secret", true],
		["a:b", false],
		["a:b:c:d", false],
		["::secret", false],
	])("classifies bearer value %j as OAuth token: %j", (token, expected) => {
		expect(hasOAuthAccessTokenShape(token)).toBe(expected);
	});

	it("round-trips an auth request through encode/decode", () => {
		const encoded = encodeAuthRequest(sampleAuthRequest);
		expect(decodeAuthRequest(encoded)).toEqual(sampleAuthRequest);
	});

	it.each([
		["not base64 json", "%%%"],
		["non-object payload", btoa(JSON.stringify("nope"))],
		["missing clientId", btoa(JSON.stringify({ responseType: "code" }))],
		[
			"non-string scope entries",
			btoa(
				JSON.stringify({
					...sampleAuthRequest,
					scope: [42],
				}),
			),
		],
		[
			"missing PKCE code challenge",
			btoa(
				JSON.stringify({
					...sampleAuthRequest,
					codeChallenge: undefined,
				}),
			),
		],
		[
			"plain PKCE method",
			btoa(
				JSON.stringify({
					...sampleAuthRequest,
					codeChallengeMethod: "plain",
				}),
			),
		],
		[
			"implicit flow response type",
			btoa(
				JSON.stringify({
					...sampleAuthRequest,
					responseType: "token",
				}),
			),
		],
	])("rejects tampered auth request payloads: %s", (_label, encoded) => {
		expect(decodeAuthRequest(encoded)).toBeNull();
	});

	it("escapes HTML in the authorization page", () => {
		const page = renderAuthorizePage({
			clientName: '<script>alert("x")</script>',
			encodedRequest: 'abc" onmouseover="evil',
		});
		expect(page).not.toContain("<script>alert");
		expect(page).toContain("&lt;script&gt;");
		expect(page).toContain("abc&quot; onmouseover=&quot;evil");
	});
});

describe("authorize endpoint", () => {
	it("renders the consent form with the client name", async () => {
		const result = await handleAuthorizeGet(
			new Request(
				"https://worker.example/authorize?response_type=code&client_id=client-123",
			),
			createFakeHelpers(),
		);
		expect(result.status).toBe(200);
		expect(result.headers.get("content-type")).toContain("text/html");
		expect(result.headers.get("cache-control")).toBe("no-store");
		expect(result.headers.get("x-frame-options")).toBe("DENY");
		const body = await result.text();
		expect(body).toContain("Claude");
		expect(body).toContain('name="oauth_request"');
		expect(body).toContain('name="hevy_api_key"');
	});

	it("rejects authorization requests without a PKCE challenge", async () => {
		const result = await handleAuthorizeGet(
			new Request(
				"https://worker.example/authorize?response_type=code&client_id=client-123",
			),
			createFakeHelpers({
				parseAuthRequest: vi.fn().mockResolvedValue({
					...sampleAuthRequest,
					codeChallenge: undefined,
				}),
			}),
		);
		expect(result.status).toBe(400);
		expect(await result.text()).toContain("PKCE");
	});

	it("returns a safe 502 when completing authorization fails", async () => {
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const result = await handleAuthorizePost(
			authorizePostRequest({
				oauth_request: encodeAuthRequest(sampleAuthRequest),
				hevy_api_key: "some-key",
			}),
			{},
			createFakeHelpers({
				completeAuthorization: vi
					.fn()
					.mockRejectedValue(new Error("kv exploded")),
			}),
			createDependencies(),
		);
		expect(result.status).toBe(502);
		expect(await result.text()).toContain("could not be completed");
		const diagnostic = JSON.stringify(stderrSpy.mock.calls);
		expect(diagnostic).toContain("oauth-complete-authorization");
		expect(diagnostic).not.toContain("kv exploded");
		stderrSpy.mockRestore();
	});

	it("rejects unknown clients", async () => {
		const result = await handleAuthorizeGet(
			new Request("https://worker.example/authorize?client_id=nope"),
			createFakeHelpers({
				lookupClient: vi.fn().mockResolvedValue(null),
			}),
		);
		expect(result.status).toBe(400);
	});

	it("completes authorization with encrypted-at-rest props", async () => {
		const completeAuthorization = vi.fn().mockResolvedValue({
			redirectTo: `${sampleAuthRequest.redirectUri}?code=abc&state=state-xyz`,
		});
		const validateApiKey = vi.fn().mockResolvedValue("valid");
		const result = await handleAuthorizePost(
			authorizePostRequest({
				oauth_request: encodeAuthRequest(sampleAuthRequest),
				hevy_api_key: " secret-key ",
			}),
			{},
			createFakeHelpers({ completeAuthorization }),
			createDependencies({ validateApiKey }),
		);

		expect(result.status).toBe(302);
		expect(result.headers.get("location")).toContain("code=abc");
		expect(validateApiKey).toHaveBeenCalledWith("secret-key", {});
		expect(completeAuthorization).toHaveBeenCalledTimes(1);
		const options = completeAuthorization.mock.calls[0]?.[0];
		expect(options?.request).toEqual(sampleAuthRequest);
		expect(options?.props).toEqual({ hevyApiKey: "secret-key" });
		// SHA-256 of the API key, never the key itself.
		expect(options?.userId).toMatch(/^[0-9a-f]{64}$/);
		expect(options?.userId).not.toContain("secret-key");
	});

	it("re-renders the form when Hevy rejects the API key", async () => {
		const completeAuthorization = vi.fn();
		const result = await handleAuthorizePost(
			authorizePostRequest({
				oauth_request: encodeAuthRequest(sampleAuthRequest),
				hevy_api_key: "bad-key",
			}),
			{},
			createFakeHelpers({ completeAuthorization }),
			createDependencies({
				validateApiKey: vi.fn().mockResolvedValue("invalid"),
			}),
		);
		expect(result.status).toBe(401);
		expect(await result.text()).toContain("rejected this API key");
		expect(completeAuthorization).not.toHaveBeenCalled();
	});

	it("re-renders with 502 when Hevy is unavailable", async () => {
		const result = await handleAuthorizePost(
			authorizePostRequest({
				oauth_request: encodeAuthRequest(sampleAuthRequest),
				hevy_api_key: "some-key",
			}),
			{},
			createFakeHelpers(),
			createDependencies({
				validateApiKey: vi.fn().mockResolvedValue("unavailable"),
			}),
		);
		expect(result.status).toBe(502);
		expect(await result.text()).toContain("temporarily unavailable");
	});

	it("rejects submissions without a usable auth request", async () => {
		const completeAuthorization = vi.fn();
		const result = await handleAuthorizePost(
			authorizePostRequest({
				oauth_request: "tampered",
				hevy_api_key: "some-key",
			}),
			{},
			createFakeHelpers({ completeAuthorization }),
			createDependencies(),
		);
		expect(result.status).toBe(400);
		expect(completeAuthorization).not.toHaveBeenCalled();
	});

	it("requires an API key before contacting Hevy", async () => {
		const validateApiKey = vi.fn().mockResolvedValue("valid");
		const result = await handleAuthorizePost(
			authorizePostRequest({
				oauth_request: encodeAuthRequest(sampleAuthRequest),
				hevy_api_key: "   ",
			}),
			{},
			createFakeHelpers(),
			createDependencies({ validateApiKey }),
		);
		expect(result.status).toBe(400);
		expect(validateApiKey).not.toHaveBeenCalled();
	});
});

interface MemoryKVEntry {
	value: string;
}

function createMemoryKV() {
	const store = new Map<string, MemoryKVEntry>();
	return {
		store,
		async get(key: string, options?: { type?: string } | string) {
			const entry = store.get(key);
			if (!entry) return null;
			const type = typeof options === "string" ? options : options?.type;
			return type === "json" ? JSON.parse(entry.value) : entry.value;
		},
		async put(key: string, value: string) {
			store.set(key, { value });
		},
		async delete(key: string) {
			store.delete(key);
		},
		async list(options?: { prefix?: string }) {
			const prefix = options?.prefix ?? "";
			return {
				keys: [...store.keys()]
					.filter((name) => name.startsWith(prefix))
					.map((name) => ({ name })),
				list_complete: true,
			};
		},
	};
}

function base64UrlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

const initializeBody = {
	jsonrpc: "2.0",
	id: 1,
	method: "initialize",
	params: {
		protocolVersion: "2025-11-25",
		capabilities: {},
		clientInfo: { name: "oauth-test", version: "1" },
	},
};

async function parseMcpResponse(response: Response) {
	const text = await response.text();
	if (response.headers.get("content-type")?.includes("text/event-stream")) {
		const data = text
			.split("\n")
			.find((line) => line.startsWith("data: "))
			?.slice(6);
		if (!data) throw new Error(`Missing SSE data: ${text}`);
		return JSON.parse(data) as Record<string, unknown>;
	}
	return JSON.parse(text) as Record<string, unknown>;
}

describe("OAuth-enabled Worker fetch handler", () => {
	const redirectUri = "https://claude.ai/api/mcp/auth_callback";

	function createHandlerWithEnv(
		dependencies: Parameters<typeof createWorkerFetchHandler>[0] = {},
	) {
		const handler = createWorkerFetchHandler({
			createValidationClient: () => createMockClient(),
			createRequestClient: () => createMockClient(),
			...dependencies,
		});
		const env = { OAUTH_KV: createMemoryKV() };
		return { handler, env };
	}

	it("serves OAuth discovery metadata when OAUTH_KV is bound", async () => {
		const { handler, env } = createHandlerWithEnv();
		const authServer = await handler(
			new Request(
				"https://worker.example/.well-known/oauth-authorization-server",
			),
			env,
			{},
		);
		expect(authServer.status).toBe(200);
		const metadata = (await authServer.json()) as Record<string, unknown>;
		expect(metadata.authorization_endpoint).toBe(
			"https://worker.example/authorize",
		);
		expect(metadata.token_endpoint).toBe("https://worker.example/token");
		expect(metadata.registration_endpoint).toBe(
			"https://worker.example/register",
		);
		expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);

		const resource = await handler(
			new Request(
				"https://worker.example/.well-known/oauth-protected-resource/mcp",
			),
			env,
			{},
		);
		expect(resource.status).toBe(200);
		const resourceMetadata = (await resource.json()) as Record<string, unknown>;
		expect(resourceMetadata.resource).toBe("https://worker.example/mcp");
	});

	it("keeps discovery paths returning 404 without OAUTH_KV", async () => {
		const { handler } = createHandlerWithEnv();
		const result = await handler(
			new Request(
				"https://worker.example/.well-known/oauth-authorization-server",
			),
			{},
			{},
		);
		expect(result.status).toBe(404);
	});

	it("falls back to legacy behavior when OAUTH_KV is not a KV namespace", async () => {
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { handler } = createHandlerWithEnv();
		const env = { OAUTH_KV: "not-a-kv-namespace" };

		const discovery = await handler(
			new Request(
				"https://worker.example/.well-known/oauth-authorization-server",
			),
			env,
			{},
		);
		expect(discovery.status).toBe(404);

		const legacy = await handler(
			new Request("https://worker.example/mcp", {
				method: "POST",
				headers: {
					accept: "application/json, text/event-stream",
					"content-type": "application/json",
					authorization: "Bearer raw-hevy-api-key",
				},
				body: JSON.stringify(initializeBody),
			}),
			env,
			{},
		);
		expect(legacy.status).toBe(200);
		expect(JSON.stringify(stderrSpy.mock.calls)).toContain(
			"oauth-kv-misconfigured",
		);
		stderrSpy.mockRestore();
	});

	it("challenges unauthenticated /mcp requests with resource metadata", async () => {
		const { handler, env } = createHandlerWithEnv();
		const result = await handler(
			new Request("https://worker.example/mcp", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}",
			}),
			env,
			{},
		);
		expect(result.status).toBe(401);
		expect(result.headers.get("www-authenticate")).toContain(
			'resource_metadata="https://worker.example/.well-known/oauth-protected-resource/mcp"',
		);
	});

	it("keeps serving raw Hevy API keys on the legacy path", async () => {
		const createValidationClient = vi.fn(() => createMockClient());
		const { handler, env } = createHandlerWithEnv({
			createValidationClient,
		});
		const result = await handler(
			new Request("https://worker.example/mcp", {
				method: "POST",
				headers: {
					accept: "application/json, text/event-stream",
					"content-type": "application/json",
					authorization: "Bearer raw-hevy-api-key",
				},
				body: JSON.stringify(initializeBody),
			}),
			env,
			{},
		);
		expect(result.status).toBe(200);
		expect(createValidationClient).toHaveBeenCalledTimes(1);
		expect(await parseMcpResponse(result)).toMatchObject({ id: 1 });
	});

	it("keeps preflight and 405 handling for /mcp unchanged", async () => {
		const { handler, env } = createHandlerWithEnv();
		const preflight = await handler(
			new Request("https://worker.example/mcp", { method: "OPTIONS" }),
			env,
			{},
		);
		expect(preflight.status).toBe(204);
		expect(preflight.headers.get("access-control-allow-methods")).toBe(
			"POST, OPTIONS",
		);

		const get = await handler(
			new Request("https://worker.example/mcp", { method: "GET" }),
			env,
			{},
		);
		expect(get.status).toBe(405);
	});

	it("allows browser origins to reach the OAuth provider", async () => {
		const { handler, env } = createHandlerWithEnv();
		const result = await handler(
			new Request("https://worker.example/mcp", {
				method: "POST",
				headers: {
					origin: "https://browser.example",
					authorization: "Bearer user:grant:secret",
				},
				body: "{}",
			}),
			env,
			{},
		);
		expect(result.status).toBe(401);
		expect(result.headers.get("access-control-allow-origin")).toBe(
			"https://browser.example",
		);
	});

	it("registers a ChatGPT browser client from its web origin", async () => {
		const { handler, env } = createHandlerWithEnv();
		const result = await handler(
			new Request("https://worker.example/register", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "https://chatgpt.com",
				},
				body: JSON.stringify({
					client_name: "ChatGPT",
					redirect_uris: [
						"https://chatgpt.com/connector_platform_oauth_redirect",
					],
					token_endpoint_auth_method: "none",
				}),
			}),
			env,
			{},
		);

		expect(result.status).toBe(201);
		expect(result.headers.get("access-control-allow-origin")).toBe(
			"https://chatgpt.com",
		);
		expect(await result.json()).toMatchObject({
			client_name: "ChatGPT",
			redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
			token_endpoint_auth_method: "none",
		});
	});

	it("completes the full OAuth flow and serves MCP requests", async () => {
		const { handler, env } = createHandlerWithEnv();

		// 1. Dynamic client registration (RFC 7591), as Claude.ai performs it.
		const registration = await handler(
			new Request("https://worker.example/register", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					client_name: "Claude",
					redirect_uris: [redirectUri],
					token_endpoint_auth_method: "none",
				}),
			}),
			env,
			{},
		);
		expect(registration.status).toBe(201);
		const client = (await registration.json()) as { client_id: string };
		expect(client.client_id).toBeTruthy();

		// 2. Authorization request renders the consent form.
		const verifier = base64UrlEncode(
			crypto.getRandomValues(new Uint8Array(32)),
		);
		const challenge = base64UrlEncode(
			new Uint8Array(
				await crypto.subtle.digest(
					"SHA-256",
					new TextEncoder().encode(verifier),
				),
			),
		);
		const authorizeUrl = new URL("https://worker.example/authorize");
		authorizeUrl.searchParams.set("response_type", "code");
		authorizeUrl.searchParams.set("client_id", client.client_id);
		authorizeUrl.searchParams.set("redirect_uri", redirectUri);
		authorizeUrl.searchParams.set("state", "state-123");
		authorizeUrl.searchParams.set("code_challenge", challenge);
		authorizeUrl.searchParams.set("code_challenge_method", "S256");
		const consent = await handler(new Request(authorizeUrl), env, {});
		expect(consent.status).toBe(200);
		const consentHtml = await consent.text();
		const encodedRequest = /name="oauth_request" value="([^"]+)"/.exec(
			consentHtml,
		)?.[1];
		expect(encodedRequest).toBeTruthy();

		// 3. The user submits their Hevy API key.
		const approval = await handler(
			new Request("https://worker.example/authorize", {
				method: "POST",
				body: new URLSearchParams({
					oauth_request: encodedRequest as string,
					hevy_api_key: "users-hevy-api-key",
				}),
			}),
			env,
			{},
		);
		expect(approval.status).toBe(302);
		const redirect = new URL(approval.headers.get("location") as string);
		expect(redirect.origin + redirect.pathname).toBe(redirectUri);
		expect(redirect.searchParams.get("state")).toBe("state-123");
		const code = redirect.searchParams.get("code");
		expect(code).toBeTruthy();

		// 4. Authorization code + PKCE verifier exchange for tokens.
		const tokenResult = await handler(
			new Request("https://worker.example/token", {
				method: "POST",
				body: new URLSearchParams({
					grant_type: "authorization_code",
					code: code as string,
					redirect_uri: redirectUri,
					client_id: client.client_id,
					code_verifier: verifier,
				}),
			}),
			env,
			{},
		);
		expect(tokenResult.status).toBe(200);
		const tokens = (await tokenResult.json()) as {
			access_token: string;
			refresh_token?: string;
			token_type: string;
		};
		expect(tokens.token_type.toLowerCase()).toBe("bearer");
		expect(hasOAuthAccessTokenShape(tokens.access_token)).toBe(true);
		expect(tokens.access_token).not.toContain("users-hevy-api-key");
		expect(tokens.refresh_token).toBeTruthy();

		// The Hevy API key is never stored in plaintext in KV.
		const kvDump = JSON.stringify([...env.OAUTH_KV.store.entries()]);
		expect(kvDump).not.toContain("users-hevy-api-key");

		// 5. The access token authorizes MCP requests.
		const requestClients: string[] = [];
		const { handler: mcpHandler } = createHandlerWithEnv({
			createRequestClient: (apiKey: string) => {
				requestClients.push(apiKey);
				return createMockClient();
			},
		});
		const mcpResult = await mcpHandler(
			new Request("https://worker.example/mcp", {
				method: "POST",
				headers: {
					accept: "application/json, text/event-stream",
					"content-type": "application/json",
					authorization: `Bearer ${tokens.access_token}`,
				},
				body: JSON.stringify(initializeBody),
			}),
			env,
			{},
		);
		expect(mcpResult.status).toBe(200);
		expect(await parseMcpResponse(mcpResult)).toMatchObject({ id: 1 });
		// The decrypted grant props resupply the original Hevy API key.
		expect(requestClients).toEqual(["users-hevy-api-key"]);

		// 6. The refresh-token grant issues a new working access token.
		const refreshResult = await handler(
			new Request("https://worker.example/token", {
				method: "POST",
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: tokens.refresh_token as string,
					client_id: client.client_id,
				}),
			}),
			env,
			{},
		);
		expect(refreshResult.status).toBe(200);
		const refreshed = (await refreshResult.json()) as {
			access_token: string;
		};
		const refreshedMcpResult = await mcpHandler(
			new Request("https://worker.example/mcp", {
				method: "POST",
				headers: {
					accept: "application/json, text/event-stream",
					"content-type": "application/json",
					authorization: `Bearer ${refreshed.access_token}`,
				},
				body: JSON.stringify(initializeBody),
			}),
			env,
			{},
		);
		expect(refreshedMcpResult.status).toBe(200);
		expect(requestClients).toEqual([
			"users-hevy-api-key",
			"users-hevy-api-key",
		]);

		// 7. A bogus OAuth-shaped token is rejected with a challenge.
		const rejected = await mcpHandler(
			new Request("https://worker.example/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: "Bearer forged:token:value",
				},
				body: JSON.stringify(initializeBody),
			}),
			env,
			{},
		);
		expect(rejected.status).toBe(401);
	});

	it("returns 401 when the stored Hevy API key was revoked upstream", async () => {
		const revokedValidation = vi.fn(() =>
			createMockClient({
				getUserInfo: vi.fn().mockRejectedValue(
					new HevyHttpError("HTTP 401", {
						status: 401,
						method: "GET",
						endpoint: "/v1/user/info",
					}),
				),
			}),
		);
		const validValidation = vi.fn(() => createMockClient());
		let validationFactory = validValidation;
		const { handler, env } = createHandlerWithEnv({
			createValidationClient: () => validationFactory(),
		});

		const registration = await handler(
			new Request("https://worker.example/register", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					redirect_uris: [redirectUri],
					token_endpoint_auth_method: "none",
				}),
			}),
			env,
			{},
		);
		const client = (await registration.json()) as { client_id: string };
		const verifier = base64UrlEncode(
			crypto.getRandomValues(new Uint8Array(32)),
		);
		const challenge = base64UrlEncode(
			new Uint8Array(
				await crypto.subtle.digest(
					"SHA-256",
					new TextEncoder().encode(verifier),
				),
			),
		);
		const authorizeUrl = new URL("https://worker.example/authorize");
		authorizeUrl.searchParams.set("response_type", "code");
		authorizeUrl.searchParams.set("client_id", client.client_id);
		authorizeUrl.searchParams.set("redirect_uri", redirectUri);
		authorizeUrl.searchParams.set("state", "s");
		authorizeUrl.searchParams.set("code_challenge", challenge);
		authorizeUrl.searchParams.set("code_challenge_method", "S256");
		const consentHtml = await (
			await handler(new Request(authorizeUrl), env, {})
		).text();
		const encodedRequest = /name="oauth_request" value="([^"]+)"/.exec(
			consentHtml,
		)?.[1] as string;
		const approval = await handler(
			new Request("https://worker.example/authorize", {
				method: "POST",
				body: new URLSearchParams({
					oauth_request: encodedRequest,
					hevy_api_key: "soon-revoked-key",
				}),
			}),
			env,
			{},
		);
		const code = new URL(
			approval.headers.get("location") as string,
		).searchParams.get("code") as string;
		const tokens = (await (
			await handler(
				new Request("https://worker.example/token", {
					method: "POST",
					body: new URLSearchParams({
						grant_type: "authorization_code",
						code,
						redirect_uri: redirectUri,
						client_id: client.client_id,
						code_verifier: verifier,
					}),
				}),
				env,
				{},
			)
		).json()) as { access_token: string };

		// The key gets revoked in Hevy after the grant was issued.
		validationFactory = revokedValidation;
		const result = await handler(
			new Request("https://worker.example/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${tokens.access_token}`,
				},
				body: JSON.stringify(initializeBody),
			}),
			env,
			{},
		);
		expect(result.status).toBe(401);
		expect(result.headers.get("www-authenticate")).toContain(
			'error="invalid_token"',
		);
	});
});
