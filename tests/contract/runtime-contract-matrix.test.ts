import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { Client, type JSONObject } from "@modelcontextprotocol/client";
import {
	createHevyMcpServer,
	type CreateHevyMcpServerOptions,
} from "@hevy-mcp/core";
import {
	CONTRACT_MATRIX_PROTOCOL_VERSION,
	getWorkoutsCapabilityDescriptor,
} from "@hevy-mcp/core";
import { startStreamableHttpServer } from "../../packages/node/src/utils/streamable-http.js";
import { createWorkerHandler } from "../../packages/worker/src/worker.js";
import {
	createDeterministicHevyClient,
	validGetWorkoutsOutput,
} from "./fixtures.js";
import { afterEach, describe, expect, it, vi } from "vitest";

const minimalInput = getWorkoutsCapabilityDescriptor.inputSchema.parse({
	page: 1,
}) as JSONObject;

function assertGetWorkoutsResult(result: unknown): void {
	if (typeof result !== "object" || result === null) {
		throw new Error("Expected MCP tool result object");
	}
	const response = result as {
		content?: unknown;
		structuredContent?: unknown;
	};
	if (!Array.isArray(response.content)) {
		throw new Error("Expected MCP tool content array");
	}
	const structured = getWorkoutsCapabilityDescriptor.outputSchema.parse(
		response.structuredContent,
	) as unknown as { workouts: readonly unknown[] };
	expect(structured).toEqual(validGetWorkoutsOutput);
	const firstContent = response.content[0];
	if (
		typeof firstContent !== "object" ||
		firstContent === null ||
		!("type" in firstContent) ||
		firstContent.type !== "text" ||
		!("text" in firstContent) ||
		typeof firstContent.text !== "string"
	) {
		throw new Error("Expected text content in MCP tool response");
	}
	expect(JSON.parse(firstContent.text)).toEqual(structured.workouts);
}

function parseStreamableResponse(text: string): JSONObject {
	const data = text
		.split("\n")
		.find((line) => line.startsWith("data: "))
		?.slice("data: ".length);
	if (!data) throw new Error(`Missing MCP SSE data: ${text}`);
	return JSON.parse(data) as JSONObject;
}

async function postNodeMcp(
	url: string,
	body: unknown,
	extraHeaders: Record<string, string> = {},
): Promise<{ response: Response; payload: JSONObject }> {
	const response = await fetch(url, {
		method: "POST",
		headers: {
			accept: "application/json, text/event-stream",
			"content-type": "application/json",
			...extraHeaders,
		},
		body: JSON.stringify(body),
	});
	return { response, payload: parseStreamableResponse(await response.text()) };
}

function mcpRequest(body: unknown): Request {
	return new Request("https://contract-matrix.example/mcp", {
		method: "POST",
		headers: {
			accept: "application/json, text/event-stream",
			"content-type": "application/json",
			authorization: "Bearer contract-test-key",
		},
		body: JSON.stringify(body),
	});
}

async function postWorkerMcp(
	handler: ReturnType<typeof createWorkerHandler>,
	body: unknown,
): Promise<{ response: Response; payload: JSONObject }> {
	const response = await handler(mcpRequest(body), {});
	return { response, payload: parseStreamableResponse(await response.text()) };
}

function initializeBody() {
	return {
		jsonrpc: "2.0",
		id: 1,
		method: "initialize",
		params: {
			protocolVersion: CONTRACT_MATRIX_PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: { name: "contract-matrix", version: "1.0.0" },
		},
	};
}

describe("initial runtime contract matrix", () => {
	let inMemoryServer: McpServer | undefined;
	let inMemoryClient: Client | undefined;

	afterEach(async () => {
		await Promise.all([inMemoryClient?.close(), inMemoryServer?.close()]);
		inMemoryClient = undefined;
		inMemoryServer = undefined;
	});

	it("runs the descriptor case through Core in-memory", async () => {
		inMemoryServer = createHevyMcpServer({
			createClient: () => createDeterministicHevyClient(),
		});
		inMemoryClient = new Client({
			name: "contract-matrix-client",
			version: "1",
		});
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await Promise.all([
			inMemoryServer.connect(serverTransport),
			inMemoryClient.connect(clientTransport),
		]);

		const listed = await inMemoryClient.listTools();
		const listedTool = listed.tools.find(
			({ name }) => name === getWorkoutsCapabilityDescriptor.name,
		);
		expect(listedTool).toBeDefined();
		expect(listedTool?.description).toBe(
			getWorkoutsCapabilityDescriptor.description,
		);

		const result = await inMemoryClient.callTool({
			name: getWorkoutsCapabilityDescriptor.name,
			arguments: minimalInput,
		});
		assertGetWorkoutsResult(result);
	});

	it("runs the descriptor case through the stateful Node HTTP adapter", async () => {
		const handle = await startStreamableHttpServer(
			{ transport: "http", host: "127.0.0.1", port: 0 },
			"contract-test-key",
			() =>
				Promise.resolve(
					createHevyMcpServer({
						createClient: () => createDeterministicHevyClient(),
					}),
				),
		);
		try {
			const address = handle.server.address();
			if (!address || typeof address === "string") throw new Error("No port");
			const url = `http://127.0.0.1:${address.port}/mcp`;
			const initialized = await postNodeMcp(url, initializeBody());
			expect(initialized.response.status).toBe(200);
			const sessionId = initialized.response.headers.get("mcp-session-id");
			expect(sessionId).toEqual(expect.any(String));
			if (!sessionId) throw new Error("Missing MCP session ID");

			const listed = await postNodeMcp(
				url,
				{ jsonrpc: "2.0", id: 2, method: "tools/list" },
				{ "mcp-session-id": sessionId },
			);
			expect(listed.response.status).toBe(200);
			const tools = listed.payload.result as {
				tools: Array<{ name: string }>;
			};
			expect(
				tools.tools.some(
					({ name }) => name === getWorkoutsCapabilityDescriptor.name,
				),
			).toBe(true);

			const called = await postNodeMcp(
				url,
				{
					jsonrpc: "2.0",
					id: 3,
					method: "tools/call",
					params: {
						name: getWorkoutsCapabilityDescriptor.name,
						arguments: minimalInput,
					},
				},
				{ "mcp-session-id": sessionId },
			);
			expect(called.response.status).toBe(200);
			assertGetWorkoutsResult(called.payload.result);
		} finally {
			await handle.close();
		}
	});

	it("runs the descriptor case through the stateless Worker handler", async () => {
		const createServer = vi.fn(
			(createClient: CreateHevyMcpServerOptions["createClient"]) =>
				createHevyMcpServer({ createClient }),
		);
		const handler = createWorkerHandler({
			createValidationClient: () => createDeterministicHevyClient(),
			createRequestClient: () => createDeterministicHevyClient(),
			createServer,
		});

		const initialized = await postWorkerMcp(handler, initializeBody());
		expect(initialized.response.status).toBe(200);
		expect(initialized.response.headers.get("mcp-session-id")).toBeNull();

		const listed = await postWorkerMcp(handler, {
			jsonrpc: "2.0",
			id: 2,
			method: "tools/list",
		});
		expect(listed.response.status).toBe(200);
		expect(listed.response.headers.get("mcp-session-id")).toBeNull();
		const tools = listed.payload.result as { tools: Array<{ name: string }> };
		expect(
			tools.tools.some(
				({ name }) => name === getWorkoutsCapabilityDescriptor.name,
			),
		).toBe(true);

		const called = await postWorkerMcp(handler, {
			jsonrpc: "2.0",
			id: 3,
			method: "tools/call",
			params: {
				name: getWorkoutsCapabilityDescriptor.name,
				arguments: minimalInput,
			},
		});
		expect(called.response.status).toBe(200);
		expect(called.response.headers.get("mcp-session-id")).toBeNull();
		assertGetWorkoutsResult(called.payload.result);
		// A fresh server is composed for every request; no Worker session state is used.
		expect(createServer).toHaveBeenCalledTimes(3);
	});
});
