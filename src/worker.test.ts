import { describe, expect, it, vi } from "vitest";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createSharedMcpServer } from "./shared-server.js";
import type { HevyClient } from "./utils/hevyClient.js";
import { HevyHttpError } from "./utils/hevy-http-error.js";
import {
	createWorkerHandler,
	parseAllowedOrigins,
	parseBearerApiKey,
} from "./worker.js";

const validHeaders = {
	accept: "application/json, text/event-stream",
	"content-type": "application/json",
	authorization: "Bearer test-key",
};

function mcpRequest(body: unknown, headers = validHeaders) {
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

	it("distinguishes invalid credentials from upstream failures", async () => {
		const invalid = createWorkerHandler({
			createValidationClient: () =>
				createMockClient({
					getUserInfo: vi.fn().mockRejectedValue(
						new HevyHttpError("HTTP 401", {
							status: 401,
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
	});
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
	});
});
