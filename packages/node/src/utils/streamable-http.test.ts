import { request, type Server } from "node:http";
import { McpServer } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";
import { startStreamableHttpServer } from "./streamable-http.js";

const createMcpServer = async () => {
	const server = new McpServer({ name: "test-server", version: "1.0.0" });
	server.registerTool(
		"mock-tool",
		{ description: "A mocked tool" },
		async () => ({ content: [{ type: "text", text: "mock result" }] }),
	);
	return server;
};

const handles: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
	await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

interface HttpResult {
	statusCode?: number;
	headers: Record<string, string | string[] | undefined>;
	body: string;
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
	body?: unknown,
	extraHeaders: Record<string, string> = {},
): Promise<HttpResult> {
	return new Promise((resolve, reject) => {
		const payload = body === undefined ? undefined : JSON.stringify(body);
		const client = request(
			{
				host: "127.0.0.1",
				port,
				path: "/mcp",
				method,
				headers: {
					Accept: "application/json, text/event-stream",
					...(payload ? { "Content-Type": "application/json" } : {}),
					...extraHeaders,
				},
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
	if (!address || typeof address === "string") throw new Error("No address");
	return address.port;
}

function jsonBody(result: HttpResult): Record<string, unknown> {
	const json = result.body.startsWith("event:")
		? result.body
				.split("\n")
				.filter((line) => line.startsWith("data:"))
				.map((line) => line.slice("data:".length).trim())
				.join("\n")
		: result.body;
	if (!json) throw new Error(`empty response: ${JSON.stringify(result)}`);
	return JSON.parse(json) as Record<string, unknown>;
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
	it("supports initialize, tools/list, and a mocked tools/call", async () => {
		const { port } = await startTestServer();
		const initialized = await initialize(port);
		expect(initialized.statusCode).toBe(200);
		const sessionId = initialized.headers["mcp-session-id"];
		expect(typeof sessionId).toBe("string");

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
		).rejects.toThrow("HEVY_MCP_HTTP_BEARER_TOKEN");
	});
});
