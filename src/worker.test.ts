import { afterEach, describe, expect, it, vi } from "vitest";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createSharedMcpServer } from "./shared-server.js";
import type { HevyClient } from "./utils/hevyClient.js";
import { HevyHttpError } from "./utils/hevy-http-error.js";
import {
	createWorkerHandler,
	parseAllowedOrigins,
	parseBearerApiKey,
} from "./worker.js";
import worker from "./worker.js";

const validHeaders = {
	accept: "application/json, text/event-stream",
	"content-type": "application/json",
	authorization: "Bearer test-key",
};

afterEach(() => {
	vi.restoreAllMocks();
});

function mcpRequest(
	body: unknown,
	headers: RequestInit["headers"] = validHeaders,
) {
	return new Request("https://worker.example/mcp", {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

function createMockClient(overrides: Partial<HevyClient> = {}): HevyClient {
	return {
		getUserInfo: vi.fn().mockResolvedValue({ data: { id: "user" } }),
		getExerciseTemplates: vi.fn().mockResolvedValue({
			page: 1,
			page_count: 1,
			exercise_templates: [],
		}),
		...overrides,
	} as HevyClient;
}

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

describe("Worker authentication helpers", () => {
	it.each([
		[null, null],
		["", null],
		["Basic abc", null],
		["Bearer", null],
		["Bearer key with-space", null],
		["Bearer key", "key"],
		["bearer case-insensitive", "case-insensitive"],
	])("parses %j safely", (value, expected) => {
		expect(parseBearerApiKey(value)).toBe(expected);
	});

	it("parses exact comma-separated origins", () => {
		expect([
			...parseAllowedOrigins("https://a.example, https://b.example"),
		]).toEqual(["https://a.example", "https://b.example"]);
	});
});

describe("Cloudflare Worker routes and CORS", () => {
	const createValidationClient = vi.fn(() => createMockClient());
	const handler = createWorkerHandler({ createValidationClient });

	it("returns 404 for unknown paths", async () => {
		const result = await handler(
			new Request("https://worker.example/unknown"),
			{},
		);
		expect(result.status).toBe(404);
	});

	it("allows requests without Origin and rejects unconfigured browser origins", async () => {
		const noOrigin = await handler(
			new Request("https://worker.example/mcp"),
			{},
		);
		expect(noOrigin.status).toBe(405);

		const rejected = await handler(
			new Request("https://worker.example/mcp", {
				headers: { origin: "https://browser.example" },
			}),
			{},
		);
		expect(rejected.status).toBe(403);
		expect(rejected.headers.get("vary")).toBe("Origin");
	});

	it("answers validated preflight without bearer authentication", async () => {
		const result = await handler(
			new Request("https://worker.example/mcp", {
				method: "OPTIONS",
				headers: { origin: "https://browser.example" },
			}),
			{ MCP_ALLOWED_ORIGINS: "https://browser.example" },
		);
		expect(result.status).toBe(204);
		expect(result.headers.get("access-control-allow-origin")).toBe(
			"https://browser.example",
		);
		expect(result.headers.get("access-control-allow-methods")).toBe(
			"POST, OPTIONS",
		);
		expect(createValidationClient).not.toHaveBeenCalled();
	});

	it("adds exact-origin CORS headers to successful MCP responses", async () => {
		const corsHandler = createWorkerHandler({
			createValidationClient: () => createMockClient(),
			createRequestClient: () => createMockClient(),
		});
		const result = await corsHandler(
			mcpRequest(
				{
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
					params: {
						protocolVersion: "2025-11-25",
						capabilities: {},
						clientInfo: { name: "test", version: "1" },
					},
				},
				{ ...validHeaders, origin: "https://browser.example" },
			),
			{ MCP_ALLOWED_ORIGINS: "https://browser.example" },
		);

		expect(result.status).toBe(200);
		expect(result.headers.get("access-control-allow-origin")).toBe(
			"https://browser.example",
		);
		expect(result.headers.get("vary")).toBe("Origin");
		expect(result.headers.get("content-type")).toContain("text/event-stream");
	});

	it("answers origin-less preflight without an allow-origin header", async () => {
		const result = await handler(
			new Request("https://worker.example/mcp", { method: "OPTIONS" }),
			{},
		);
		expect(result.status).toBe(204);
		expect(result.headers.get("access-control-allow-origin")).toBeNull();
		expect(result.headers.get("access-control-allow-methods")).toBe(
			"POST, OPTIONS",
		);
	});

	it.each(["GET", "DELETE", "PUT"])(
		"returns 405 for unsupported %s",
		async (method) => {
			const result = await handler(
				new Request("https://worker.example/mcp", { method }),
				{},
			);
			expect(result.status).toBe(405);
			expect(result.headers.get("allow")).toBe("POST, OPTIONS");
		},
	);

	it("preserves CORS headers on supported origins for error responses", async () => {
		const result = await handler(
			new Request("https://worker.example/mcp", {
				method: "GET",
				headers: { origin: "https://browser.example" },
			}),
			{ MCP_ALLOWED_ORIGINS: "https://browser.example" },
		);
		expect(result.status).toBe(405);
		expect(result.headers.get("access-control-allow-origin")).toBe(
			"https://browser.example",
		);
	});

	it("returns a generic bearer challenge for missing credentials", async () => {
		const result = await handler(
			mcpRequest(
				{ jsonrpc: "2.0", id: 1, method: "initialize" },
				{
					accept: validHeaders.accept,
					"content-type": "application/json",
					authorization: "Basic secret",
				},
			),
			{},
		);
		expect(result.status).toBe(401);
		expect(result.headers.get("www-authenticate")).toBe("Bearer");
		expect(await result.text()).toBe("Unauthorized");
	});

	it.each([401, 403])(
		"distinguishes invalid %s credentials from upstream failures",
		async (status) => {
			const invalid = createWorkerHandler({
				createValidationClient: () =>
					createMockClient({
						getUserInfo: vi.fn().mockRejectedValue(
							new HevyHttpError(`HTTP ${status}`, {
								status,
								method: "GET",
								endpoint: "/v1/user/info",
							}),
						),
					}),
			});
			const unavailable = createWorkerHandler({
				createValidationClient: () =>
					createMockClient({
						getUserInfo: vi.fn().mockRejectedValue(new TypeError("network")),
					}),
			});
			expect((await invalid(mcpRequest({}), {})).status).toBe(401);
			expect((await unavailable(mcpRequest({}), {})).status).toBe(502);
		},
	);
});

describe("real stateless SDK transport", () => {
	it("initializes and lists tools with streaming responses and no session ID", async () => {
		const createValidationClient = vi.fn(() => createMockClient());
		const createRequestClient = vi.fn(() => createMockClient());
		const createServer = vi.fn((apiKey: string, hevyClient: HevyClient) =>
			createSharedMcpServer({ apiKey, hevyClient }),
		);
		const createTransport = vi.fn(
			() =>
				new WebStandardStreamableHTTPServerTransport({
					sessionIdGenerator: undefined,
				}),
		);
		const handler = createWorkerHandler({
			createValidationClient,
			createRequestClient,
			createServer,
			createTransport,
		});
		const initialize = await handler(
			mcpRequest({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-11-25",
					capabilities: {},
					clientInfo: { name: "test", version: "1" },
				},
			}),
			{},
		);
		expect(initialize.status).toBe(200);
		expect(initialize.headers.get("content-type")).toContain(
			"text/event-stream",
		);
		expect(initialize.headers.get("mcp-session-id")).toBeNull();
		expect(await parseMcpResponse(initialize)).toMatchObject({ id: 1 });

		const list = await handler(
			mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
			{},
		);
		const payload = await parseMcpResponse(list);
		expect(payload).toMatchObject({ id: 2 });
		expect(JSON.stringify(payload)).toContain("get-user-info");
		expect(createValidationClient).toHaveBeenCalledTimes(2);
		expect(createRequestClient).toHaveBeenCalledTimes(2);
		expect(createServer).toHaveBeenCalledTimes(2);
		expect(createTransport).toHaveBeenCalledTimes(2);
		expect(createServer.mock.results[0]?.value).not.toBe(
			createServer.mock.results[1]?.value,
		);
		expect(createTransport.mock.results[0]?.value).not.toBe(
			createTransport.mock.results[1]?.value,
		);
	});

	it("keeps exercise catalogs isolated between distinct bearer keys", async () => {
		const createRequestClient = vi.fn((key: string) =>
			createMockClient({
				getExerciseTemplates: vi.fn().mockResolvedValue({
					page: 1,
					page_count: 1,
					exercise_templates: [
						{ id: `${key}-id`, title: `${key} exercise`, is_custom: true },
					],
				}),
			}),
		);
		const handler = createWorkerHandler({
			createValidationClient: () => createMockClient(),
			createRequestClient,
		});
		const call = async (key: string, id: number) => {
			const result = await handler(
				mcpRequest(
					{
						jsonrpc: "2.0",
						id,
						method: "tools/call",
						params: {
							name: "search-exercise-templates",
							arguments: { query: "exercise", refresh: false },
						},
					},
					{ ...validHeaders, authorization: `Bearer ${key}` },
				),
				{},
			);
			return JSON.stringify(await parseMcpResponse(result));
		};

		const first = await call("first-key", 1);
		const second = await call("second-key", 2);
		expect(first).toContain("first-key exercise");
		expect(first).not.toContain("second-key exercise");
		expect(second).toContain("second-key exercise");
		expect(second).not.toContain("first-key exercise");
	});

	it("never echoes a bearer key when server construction fails", async () => {
		const secret = "super-secret-value";
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const handler = createWorkerHandler({
			createValidationClient: () => createMockClient(),
			createRequestClient: () => createMockClient(),
			createServer: () => {
				throw new Error(secret);
			},
		});
		const result = await handler(
			mcpRequest({}, { ...validHeaders, authorization: `Bearer ${secret}` }),
			{},
		);
		expect(result.status).toBe(500);
		expect(await result.text()).not.toContain(secret);
		const diagnostic = JSON.stringify(stderrSpy.mock.calls);
		expect(diagnostic).toContain("mcp-request-processing");
		expect(diagnostic).toContain("category");
		expect(diagnostic).toContain("Error");
		expect(diagnostic).not.toContain(secret);
		stderrSpy.mockRestore();
	});

	it("logs only allowlisted Hevy error metadata", async () => {
		const secret = "sentinel-bearer-value";
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const handler = createWorkerHandler({
			createValidationClient: () => createMockClient(),
			createRequestClient: () => createMockClient(),
			createServer: () => {
				throw new HevyHttpError(`Bearer ${secret}`, {
					status: 503,
					method: "GET",
					endpoint: "/v1/workouts/:workoutId",
					code: "HEVY_RETRY_EXHAUSTED",
					headers: new Headers({ authorization: `Bearer ${secret}` }),
				});
			},
		});
		const result = await handler(
			mcpRequest({}, { ...validHeaders, authorization: `Bearer ${secret}` }),
			{},
		);
		expect(result.status).toBe(500);
		const diagnostic = JSON.stringify(stderrSpy.mock.calls);
		expect(diagnostic).toContain("HevyHttpError");
		expect(diagnostic).toContain("HEVY_RETRY_EXHAUSTED");
		expect(diagnostic).toContain("/v1/workouts/:workoutId");
		expect(diagnostic).toContain("503");
		expect(diagnostic).not.toContain(secret);
		expect(diagnostic).not.toContain("authorization");
		stderrSpy.mockRestore();
	});

	it("omits hostile Hevy metadata and unknown thrown values", async () => {
		const secret = "sentinel-hostile-value";
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		stderrSpy.mockClear();
		const hostileHandler = createWorkerHandler({
			createValidationClient: () => createMockClient(),
			createServer: () => {
				throw new HevyHttpError(secret, {
					status: 999,
					method: `GET\n${secret}`,
					endpoint: `https://attacker.example/${secret}`,
					code: secret,
					cause: { secret },
				});
			},
		});
		await hostileHandler(mcpRequest({}), {});

		const cyclic: { self?: unknown; secret: string } = { secret };
		cyclic.self = cyclic;
		const unknownHandler = createWorkerHandler({
			createValidationClient: () => createMockClient(),
			createServer: () => {
				throw cyclic;
			},
		});
		await unknownHandler(mcpRequest({}), {});

		const diagnostics = stderrSpy.mock.calls.map((call) => call[1]);
		expect(diagnostics[0]).toMatchObject({
			context: "mcp-request-processing",
			category: "HevyHttpError",
		});
		expect(diagnostics[0]).not.toHaveProperty("code");
		expect(diagnostics[0]).not.toHaveProperty("status");
		expect(diagnostics[0]).not.toHaveProperty("method");
		expect(diagnostics[0]).not.toHaveProperty("endpoint");
		expect(diagnostics[1]).toMatchObject({
			context: "mcp-request-processing",
			category: "UnknownError",
		});
		expect(JSON.stringify(stderrSpy.mock.calls)).not.toContain(secret);
		stderrSpy.mockRestore();
	});

	it.each([
		[new RangeError("range"), "RangeError"],
		[new ReferenceError("reference"), "ReferenceError"],
		[new SyntaxError("syntax"), "SyntaxError"],
		[new URIError("uri"), "URIError"],
		[new EvalError("eval"), "EvalError"],
		[new AggregateError([], "aggregate"), "AggregateError"],
	] as const)(
		"classifies %s without exposing details",
		async (failure, type) => {
			const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			stderrSpy.mockClear();
			const handler = createWorkerHandler({
				createValidationClient: () => createMockClient(),
				createServer: () => {
					throw failure;
				},
			});

			expect((await handler(mcpRequest({}), {})).status).toBe(500);
			expect(JSON.stringify(stderrSpy.mock.calls)).toContain(type);
			stderrSpy.mockRestore();
		},
	);

	it("routes transport errors through safe diagnostics", async () => {
		const secret = "sentinel-transport-value";
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		stderrSpy.mockClear();
		const transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
		});
		const handler = createWorkerHandler({
			createValidationClient: () => createMockClient(),
			createRequestClient: () => createMockClient(),
			createTransport: () => transport,
		});

		const result = await handler(mcpRequest({}), {});
		transport.onerror?.(new Error(secret));

		expect(result.status).toBe(400);
		const diagnostic = stderrSpy.mock.calls.find(
			(call) =>
				(call[1] as { context?: string } | undefined)?.context ===
				"streamable-http-transport",
		)?.[1];
		expect(diagnostic).toMatchObject({
			context: "streamable-http-transport",
			category: "Error",
		});
		expect(JSON.stringify(stderrSpy.mock.calls)).not.toContain(secret);
		stderrSpy.mockRestore();
	});

	it("uses Worker-safe default factories through the default export", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ id: "user" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const result = await worker.fetch(
			mcpRequest({
				jsonrpc: "2.0",
				id: 7,
				method: "initialize",
				params: {
					protocolVersion: "2025-11-25",
					capabilities: {},
					clientInfo: { name: "default-test", version: "1" },
				},
			}),
			{},
		);

		expect(result.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [input, init] = fetchSpy.mock.calls[0] ?? [];
		const requestUrl =
			input instanceof Request
				? input.url
				: input instanceof URL
					? input.href
					: input;
		expect(new URL(requestUrl).pathname).toBe("/v1/user/info");
		expect(new URL(requestUrl).origin).toBe("https://api.hevyapp.com");
		expect(init?.redirect).toBe("manual");
		expect(new Headers(init?.headers).get("api-key")).toBe("test-key");
		fetchSpy.mockRestore();
	});

	it("uses a normalized override for authentication and tool requests", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
			async () =>
				new Response(
					JSON.stringify({
						data: {
							id: "override-user",
							name: "Override User",
							url: "https://hevy.com/user/override-user",
						},
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
		);

		const result = await worker.fetch(
			mcpRequest({
				jsonrpc: "2.0",
				id: 8,
				method: "tools/call",
				params: { name: "get-user-info", arguments: {} },
			}),
			{ HEVY_API_BASE_URL: "https://fake-hevy.example///" },
		);

		expect(result.status).toBe(200);
		expect(JSON.stringify(await parseMcpResponse(result))).toContain(
			"override-user",
		);
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		for (const [input, init] of fetchSpy.mock.calls) {
			const requestUrl =
				input instanceof Request
					? input.url
					: input instanceof URL
						? input.href
						: input;
			expect(new URL(requestUrl).origin).toBe("https://fake-hevy.example");
			expect(new URL(requestUrl).pathname).toBe("/v1/user/info");
			expect(new Headers(init?.headers).get("api-key")).toBe("test-key");
		}
		fetchSpy.mockRestore();
	});

	it.each([
		"/relative",
		"ftp://fake-hevy.example",
		"https://user:password@fake-hevy.example",
		"https://fake-hevy.example/v1",
		"https://fake-hevy.example?target=production",
		"not a URL",
	])("fails closed for malformed override %s", async (baseUrl) => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const result = await worker.fetch(
			mcpRequest({ jsonrpc: "2.0", id: 9, method: "tools/list" }),
			{ HEVY_API_BASE_URL: baseUrl },
		);

		expect(result.status).toBe(500);
		expect(await result.text()).toBe("Worker configuration error");
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});
});
