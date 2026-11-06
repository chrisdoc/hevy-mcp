import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
	failures: [] as Array<{ error: unknown; context: { expected?: boolean } }>,
}));
vi.mock("./telemetry.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./telemetry.js")>();
	return {
		...actual,
		captureFailure: (error: unknown, context: { expected?: boolean }) => {
			captured.failures.push({ error, context });
			return {};
		},
	};
});

import { installSdkErrorTracking } from "./sdk-observability.js";
import { startStreamableHttpServer } from "./streamable-http.js";

const handles: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
	await Promise.all(handles.splice(0).map((handle) => handle.close()));
	captured.failures.length = 0;
	vi.restoreAllMocks();
});

function post(
	port: number,
	body: unknown,
	headers: Record<string, string>,
): Promise<{ statusCode?: number; sessionId?: string }> {
	return new Promise((resolve, reject) => {
		const client = request(
			{ host: "127.0.0.1", port, path: "/mcp", method: "POST", headers },
			(response) => {
				response.resume();
				response.once("end", () =>
					resolve({
						statusCode: response.statusCode,
						sessionId: response.headers["mcp-session-id"] as string | undefined,
					}),
				);
			},
		);
		client.once("error", reject);
		client.end(JSON.stringify(body));
	});
}

describe("client-caused Streamable HTTP protocol errors", () => {
	it("does not report a client's 406 Accept mistake to Sentry as an unexpected server failure", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const factory = () => {
			const server = new McpServer({ name: "test", version: "1.0.0" });
			installSdkErrorTracking(server, "http");
			return Promise.resolve(server);
		};
		const handle = await startStreamableHttpServer(
			{ transport: "http", host: "127.0.0.1", port: 0 },
			"fake-key",
			factory,
		);
		handles.push(handle);
		const port = ((handle.server as Server).address() as AddressInfo).port;
		const good = {
			Accept: "application/json, text/event-stream",
			"Content-Type": "application/json",
		};
		const init = await post(
			port,
			{
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-06-18",
					capabilities: {},
					clientInfo: { name: "test", version: "1.0.0" },
				},
			},
			good,
		);
		expect(init.statusCode).toBe(200);
		captured.failures.length = 0;

		const rejected = await post(
			port,
			{ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
			{
				Accept: "application/json",
				"Content-Type": "application/json",
				"mcp-session-id": String(init.sessionId),
				"mcp-protocol-version": "2025-06-18",
			},
		);
		expect(rejected.statusCode).toBe(406);

		// The 406 is the client's own HTTP mistake, already answered with a
		// typed JSON-RPC error. It must not become an unexpected Sentry event.
		const unexpected = captured.failures
			.filter((failure) => failure.context.expected !== true)
			.map((failure) => (failure.error as Error).message);
		expect(unexpected).toEqual([]);
	});

	it.each([
		new Error("Not Acceptable: Client must accept text/event-stream"),
		new Error("Unsupported Media Type: Content-Type must be application/json"),
		new Error("Method not allowed."),
		new Error("Bad Request: Server not initialized"),
		new Error("Session not found"),
		new SyntaxError("Unexpected token } in JSON at position 1"),
	])("classifies %s as an expected client error", (error) => {
		const server = new McpServer({ name: "test", version: "1.0.0" });
		installSdkErrorTracking(server, "http");
		server.server.onerror?.(error);
		expect(
			captured.failures.map((failure) => failure.context.expected),
		).toEqual([true]);
	});

	it("still reports real server-side protocol errors as unexpected", () => {
		const server = new McpServer({ name: "test", version: "1.0.0" });
		installSdkErrorTracking(server, "http");
		server.server.onerror?.(
			new Error("Response for request ID 3 is undeliverable"),
		);
		server.server.onerror?.(
			new TypeError("cannot read properties of undefined"),
		);
		expect(
			captured.failures.map((failure) => failure.context.expected === true),
		).toEqual([false, false]);
	});
});
