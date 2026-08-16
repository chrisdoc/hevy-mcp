import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	resolveHttpAdmissionConfig,
	startStreamableHttpServer,
} from "./streamable-http.js";

const createMcpServer = () => {
	const server = new McpServer({ name: "test-server", version: "1.0.0" });
	server.registerTool("mock-tool", { description: "A mocked tool" }, () =>
		Promise.resolve({ content: [{ type: "text", text: "mock result" }] }),
	);
	return Promise.resolve(server);
};

const stringSchema = z.string();
type HttpJsonValue =
	| string
	| number
	| boolean
	| null
	| HttpJsonObject
	| HttpJsonValue[];
type HttpJsonObject = { readonly [key: string]: HttpJsonValue };

function isString(value: string | AddressInfo | null): value is string {
	return stringSchema.safeParse(value).success;
}

const handles: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
	await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

interface HttpResult {
	statusCode?: number;
	headers: Record<string, string | string[] | undefined>;
	body: string;
}

interface HttpRequestHeaders {
	[key: string]: string;
}

function openStream(
	port: number,
	headers: Record<string, string>,
): Promise<{ ended: Promise<void> }> {
	return new Promise((resolve, reject) => {
		const client = request(
			{
				host: "127.0.0.1",
				port,
				path: "/mcp",
				method: "GET",
				headers: { Accept: "text/event-stream", ...headers },
			},
			(response) => {
				const ended = new Promise<void>((finish) => {
					response.once("end", finish);
					response.once("close", finish);
				});
				resolve({ ended });
			},
		);
		client.once("error", reject);
		client.end();
	});
}

function call(
	port: number,
	method: string,
	body?: HttpJsonObject | string,
	extraHeaders: Record<string, string> = {},
): Promise<HttpResult> {
	return new Promise((resolve, reject) => {
		const payload = body === undefined ? undefined : JSON.stringify(body);
		const headers: HttpRequestHeaders = {
			Accept: "application/json, text/event-stream",
			...extraHeaders,
		};
		if (payload) headers["Content-Type"] = "application/json";
		const client = request(
			{
				host: "127.0.0.1",
				port,
				path: "/mcp",
				method,
				headers,
			},
			(response) => {
				const chunks: Buffer[] = [];
				response.on("data", (chunk: Buffer) => chunks.push(chunk));
				response.once("end", () =>
					resolve({
						statusCode: response.statusCode,
						headers: response.headers,
						body: Buffer.concat(chunks).toString("utf8"),
					}),
				);
			},
		);
		client.once("error", reject);
		if (payload) client.write(payload);
		client.end();
	});
}

function serverPort(handle: { server: Server }): number {
	const address = handle.server.address();
	if (!address || isString(address)) throw new Error("No address");
	return address.port;
}

function jsonBody(result: HttpResult): unknown {
	const json = result.body.startsWith("event:")
		? result.body
				.split("\n")
				.filter((line) => line.startsWith("data:"))
				.map((line) => line.slice("data:".length).trim())
				.join("\n")
		: result.body;
	if (!json) throw new Error(`empty response: ${JSON.stringify(result)}`);
	return JSON.parse(json);
}

async function startTestServer(host = "127.0.0.1") {
	const handle = await startStreamableHttpServer(
		{ transport: "http", host, port: 0 },
		"test-key",
		createMcpServer,
	);
	handles.push(handle);
	return { handle, port: serverPort(handle) };
}

async function startDisconnectTestServer() {
	let releaseTool!: () => void;
	let markStarted!: () => void;
	const toolStarted = new Promise<void>((resolve) => {
		markStarted = resolve;
	});
	const toolRelease = new Promise<void>((resolve) => {
		releaseTool = resolve;
	});
	const createHangingServer = () => {
		const server = new McpServer({ name: "test-server", version: "1.0.0" });
		server.registerTool(
			"mock-tool",
			{ description: "A mocked tool" },
			async () => {
				markStarted();
				await toolRelease;
				return { content: [{ type: "text", text: "mock result" }] };
			},
		);
		return Promise.resolve(server);
	};
	const started = await startStreamableHttpServer(
		{ transport: "http", host: "127.0.0.1", port: 0 },
		"test-key",
		createHangingServer,
	);
	handles.push(started);
	return { ...started, port: serverPort(started), toolStarted, releaseTool };
}

async function initialize(port: number, headers: Record<string, string> = {}) {
	return call(
		port,
		"POST",
		{
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2025-06-18",
				capabilities: {},
				clientInfo: { name: "protocol-test", version: "1.0.0" },
			},
		},
		headers,
	);
}

describe("Streamable HTTP server", () => {
	it("uses safe admission defaults and bounded environment overrides", () => {
		expect(resolveHttpAdmissionConfig()).toEqual({
			maxSessions: 100,
			maxInitializing: 10,
			idleTimeoutMs: 1_800_000,
			bodyTimeoutMs: 30_000,
		});
		process.env.HEVY_MCP_HTTP_MAX_SESSIONS = "7";
		process.env.HEVY_MCP_HTTP_MAX_INITIALIZING = "0";
		process.env.HEVY_MCP_HTTP_IDLE_TIMEOUT_MS = "999999999999";
		process.env.HEVY_MCP_HTTP_BODY_TIMEOUT_MS = "not-a-number";
		try {
			expect(resolveHttpAdmissionConfig()).toEqual({
				maxSessions: 7,
				maxInitializing: 10,
				idleTimeoutMs: 86_400_000,
				bodyTimeoutMs: 30_000,
			});
			expect(
				resolveHttpAdmissionConfig({
					maxSessions: 2,
					maxInitializing: 3,
					idleTimeoutMs: 4,
					bodyTimeoutMs: 5,
				}),
			).toEqual({
				maxSessions: 2,
				maxInitializing: 3,
				idleTimeoutMs: 4,
				bodyTimeoutMs: 5,
			});
			expect(
				resolveHttpAdmissionConfig({
					maxSessions: 0.5,
					maxInitializing: 0.5,
					idleTimeoutMs: 0.5,
					bodyTimeoutMs: 0.5,
				}),
			).toEqual({
				maxSessions: 100,
				maxInitializing: 10,
				idleTimeoutMs: 1_800_000,
				bodyTimeoutMs: 30_000,
			});
		} finally {
			delete process.env.HEVY_MCP_HTTP_MAX_SESSIONS;
			delete process.env.HEVY_MCP_HTTP_MAX_INITIALIZING;
			delete process.env.HEVY_MCP_HTTP_IDLE_TIMEOUT_MS;
			delete process.env.HEVY_MCP_HTTP_BODY_TIMEOUT_MS;
		}
	});

	it("returns 429 at established-session capacity", async () => {
		const first = await startStreamableHttpServer(
			{ transport: "http", host: "127.0.0.1", port: 0 },
			"test-key",
			createMcpServer,
			{ maxSessions: 1 },
		);
		handles.push(first);
		const firstInitialized = await initialize(serverPort(first));
		expect(firstInitialized.statusCode).toBe(200);
		expect((await initialize(serverPort(first))).statusCode).toBe(429);
	});

	it("returns 503 while initialization capacity is occupied and aborts it on shutdown", async () => {
		let started!: () => void;
		let signal: AbortSignal | undefined;
		const startedPromise = new Promise<void>((resolve) => {
			started = resolve;
		});
		const createHangingServer = ({
			lifecycleSignal,
		}: {
			lifecycleSignal?: AbortSignal;
		}) => {
			signal = lifecycleSignal;
			started();
			return new Promise<Awaited<ReturnType<typeof createMcpServer>>>(
				(resolve) => {
					lifecycleSignal?.addEventListener(
						"abort",
						async () => resolve(await createMcpServer()),
						{ once: true },
					);
				},
			);
		};
		const handle = await startStreamableHttpServer(
			{ transport: "http", host: "127.0.0.1", port: 0 },
			"test-key",
			createHangingServer,
			{ maxInitializing: 1 },
		);
		handles.push(handle);
		const first = initialize(serverPort(handle));
		await startedPromise;
		expect((await initialize(serverPort(handle))).statusCode).toBe(503);
		await handle.close();
		expect(signal?.aborted).toBe(true);
		await first.catch(() => undefined);
	});

	it("recovers capacity after DELETE and idle eviction", async () => {
		const handle = await startStreamableHttpServer(
			{ transport: "http", host: "127.0.0.1", port: 0 },
			"test-key",
			createMcpServer,
			{ maxSessions: 1, idleTimeoutMs: 200 },
		);
		handles.push(handle);
		const port = serverPort(handle);
		const first = await initialize(port);
		const firstSession = String(first.headers["mcp-session-id"]);
		expect(
			(
				await call(port, "DELETE", undefined, {
					"mcp-session-id": firstSession,
				})
			).statusCode,
		).toBe(200);
		expect((await initialize(port)).statusCode).toBe(200);
		const secondInitialize = await initialize(port);
		expect(secondInitialize.statusCode).toBe(429);
		await vi.waitFor(
			async () => expect((await initialize(port)).statusCode).toBe(200),
			{ timeout: 1_000, interval: 5 },
		);
	});

	it("returns a safe 408 when a request body stalls", async () => {
		const handle = await startStreamableHttpServer(
			{ transport: "http", host: "127.0.0.1", port: 0 },
			"test-key",
			createMcpServer,
			{ bodyTimeoutMs: 10 },
		);
		handles.push(handle);
		const result = await new Promise<HttpResult>((resolve, reject) => {
			const client = request(
				{
					host: "127.0.0.1",
					port: serverPort(handle),
					path: "/mcp",
					method: "POST",
				},
				(response) => {
					const chunks: Buffer[] = [];
					response.on("data", (chunk: Buffer) => chunks.push(chunk));
					response.once("end", () =>
						resolve({
							statusCode: response.statusCode,
							headers: response.headers,
							body: Buffer.concat(chunks).toString("utf8"),
						}),
					);
				},
			);
			client.once("error", reject);
			client.flushHeaders();
		});
		expect(result.statusCode).toBe(408);
		expect(result.body).toBe('{"error":"Request body timed out."}');
	});

	it("supports initialize, tools/list, and a mocked tools/call", async () => {
		const { port } = await startTestServer();
		const initialized = await initialize(port);
		expect(initialized.statusCode).toBe(200);
		const sessionId = initialized.headers["mcp-session-id"];
		expect(stringSchema.safeParse(sessionId).success).toBe(true);

		const headers = { "mcp-session-id": String(sessionId) };
		const listed = await call(
			port,
			"POST",
			{
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: {},
			},
			headers,
		);
		expect(listed.statusCode).toBe(200);
		expect(JSON.stringify(jsonBody(listed))).toContain("mock-tool");

		const called = await call(
			port,
			"POST",
			{
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: { name: "mock-tool", arguments: {} },
			},
			headers,
		);
		expect(called.statusCode).toBe(200);
		expect(JSON.stringify(jsonBody(called))).toContain("mock result");
	});

	it("keeps two clients isolated and routes unknown sessions safely", async () => {
		const { port } = await startTestServer();
		const first = await initialize(port);
		const second = await initialize(port);
		const firstSession = String(first.headers["mcp-session-id"]);
		const secondSession = String(second.headers["mcp-session-id"]);
		expect(firstSession).not.toBe(secondSession);

		const firstList = await call(
			port,
			"POST",
			{ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
			{ "mcp-session-id": firstSession },
		);
		const secondList = await call(
			port,
			"POST",
			{ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
			{ "mcp-session-id": secondSession },
		);
		expect(firstList.statusCode).toBe(200);
		expect(secondList.statusCode).toBe(200);

		expect((await call(port, "POST", { jsonrpc: "2.0" })).statusCode).toBe(400);
		expect(
			(
				await call(
					port,
					"POST",
					{ jsonrpc: "2.0", id: 4, method: "tools/list" },
					{ "mcp-session-id": "missing-session" },
				)
			).statusCode,
		).toBe(404);
	});

	it("removes a session on DELETE", async () => {
		const { port } = await startTestServer();
		const initialized = await initialize(port);
		const sessionId = String(initialized.headers["mcp-session-id"]);
		const deleted = await call(port, "DELETE", undefined, {
			"mcp-session-id": sessionId,
		});
		expect(deleted.statusCode).toBe(200);
		expect(
			(
				await call(
					port,
					"POST",
					{ jsonrpc: "2.0", id: 2, method: "tools/list" },
					{ "mcp-session-id": sessionId },
				)
			).statusCode,
		).toBe(404);
	});

	it("evicts a session after a disconnected request", async () => {
		const { port, toolStarted, releaseTool } =
			await startDisconnectTestServer();
		const initialized = await initialize(port);
		const sessionId = String(initialized.headers["mcp-session-id"]);
		const payload = JSON.stringify({
			jsonrpc: "2.0",
			id: 2,
			method: "tools/call",
			params: { name: "mock-tool", arguments: {} },
		});
		const disconnected = request({
			host: "127.0.0.1",
			port,
			path: "/mcp",
			method: "POST",
			headers: {
				Accept: "application/json, text/event-stream",
				"Content-Type": "application/json",
				"mcp-session-id": sessionId,
			},
		});
		disconnected.once("error", () => {});
		disconnected.end(payload);
		await toolStarted;
		disconnected.destroy();

		await vi.waitFor(async () => {
			const aftermath = await call(
				port,
				"POST",
				{ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} },
				{ "mcp-session-id": sessionId },
			);
			expect(aftermath.statusCode).toBe(404);
		});
		releaseTool();
	});

	it("aborts active session execution when DELETE closes the transport", async () => {
		let sessionSignal: AbortSignal | undefined;
		let markStarted!: () => void;
		const toolStarted = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		const createAbortAwareServer = ({
			lifecycleSignal,
		}: {
			apiKey: string;
			lifecycleSignal?: AbortSignal;
		}) => {
			sessionSignal = lifecycleSignal;
			const server = new McpServer({ name: "abort-aware", version: "1.0.0" });
			server.registerTool(
				"mock-tool",
				{ description: "A mocked tool" },
				async () => {
					markStarted();
					await new Promise<void>((resolve) =>
						lifecycleSignal?.addEventListener("abort", () => resolve(), {
							once: true,
						}),
					);
					return { content: [{ type: "text", text: "aborted" }] };
				},
			);
			return Promise.resolve(server);
		};
		const handle = await startStreamableHttpServer(
			{ transport: "http", host: "127.0.0.1", port: 0 },
			"test-key",
			createAbortAwareServer,
		);
		handles.push(handle);
		const port = serverPort(handle);
		const initialized = await initialize(port);
		const sessionId = String(initialized.headers["mcp-session-id"]);
		const pendingCall = call(
			port,
			"POST",
			{
				jsonrpc: "2.0",
				id: 2,
				method: "tools/call",
				params: { name: "mock-tool", arguments: {} },
			},
			{ "mcp-session-id": sessionId },
		).catch(() => undefined);
		await toolStarted;
		await expect(
			call(port, "DELETE", undefined, { "mcp-session-id": sessionId }),
		).resolves.toMatchObject({ statusCode: 200 });
		expect(sessionSignal?.aborted).toBe(true);
		void pendingCall;
	});

	it("requires bearer authentication for wildcard binds", async () => {
		process.env.HEVY_MCP_HTTP_BEARER_TOKEN = "http-test-token";
		try {
			const { port } = await startTestServer("0.0.0.0");
			expect((await initialize(port)).statusCode).toBe(401);
			const authorized = await initialize(port, {
				authorization: "Bearer http-test-token",
			});
			expect(authorized.statusCode).toBe(200);
		} finally {
			delete process.env.HEVY_MCP_HTTP_BEARER_TOKEN;
		}
	});

	it("returns safe 400/413 responses for malformed and oversized bodies", async () => {
		const { port } = await startTestServer();
		// Send malformed JSON directly because the helper serializes valid bodies.
		const invalid = await new Promise<HttpResult>((resolve, reject) => {
			const client = request(
				{ host: "127.0.0.1", port, path: "/mcp", method: "POST" },
				(response) => {
					const chunks: Buffer[] = [];
					response.on("data", (chunk: Buffer) => chunks.push(chunk));
					response.once("end", () =>
						resolve({
							statusCode: response.statusCode,
							headers: response.headers,
							body: Buffer.concat(chunks).toString("utf8"),
						}),
					);
				},
			);
			client.once("error", reject);
			client.end("not-json");
		});
		expect(invalid.statusCode).toBe(400);
		expect(invalid.body).not.toContain("not-json");

		const oversized = await call(port, "POST", "x".repeat(1_048_577));
		expect(oversized.statusCode).toBe(413);
	});

	it("returns structured errors when an MCP session fails during startup", async () => {
		const handle = await startStreamableHttpServer(
			{ transport: "http", host: "127.0.0.1", port: 0 },
			"test-key",
			() => Promise.reject(new Error("private startup detail")),
		);
		handles.push(handle);

		const result = await initialize(serverPort(handle));
		expect(result.statusCode).toBe(500);
		expect(result.body).toContain('"outcome":"terminal_failure"');
		expect(result.body).not.toContain("private startup detail");
	});

	it("rejects a DNS-rebinding Host header and closes active sessions", async () => {
		const { handle, port } = await startTestServer();
		expect(
			(
				await call(
					port,
					"POST",
					{ jsonrpc: "2.0" },
					{ host: "attacker.example" },
				)
			).statusCode,
		).toBe(403);
		const initialized = await initialize(port);
		expect(initialized.statusCode).toBe(200);
		const stream = await openStream(port, {
			"mcp-session-id": String(initialized.headers["mcp-session-id"]),
		});
		await expect(handle.close()).resolves.toBeUndefined();
		await expect(stream.ended).resolves.toBeUndefined();
		expect(handle.server.listening).toBe(false);
	});

	it("rejects non-loopback startup without a bearer token", async () => {
		await expect(
			startStreamableHttpServer(
				{ transport: "http", host: "192.0.2.1", port: 3000 },
				"test-key",
				createMcpServer,
			),
		).rejects.toThrow(
			"Set HEVY_MCP_HTTP_BEARER_TOKEN to a secure random value, then retry.",
		);
	});
});
