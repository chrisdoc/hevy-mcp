import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import nock from "nock";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { registerWorkoutTools } from "../../../src/tools/workouts.js";
import { createClient } from "../../../src/utils/hevyClient.js";

const HEVY_API_BASEURL = "https://api.hevyapp.com";
const MOCK_HEVY_API_KEY = "mock-hevy-api-key";

function getApiScope() {
	return nock(HEVY_API_BASEURL, {
		reqheaders: {
			"api-key": MOCK_HEVY_API_KEY,
		},
	});
}

async function callTool(
	client: Client,
	name: string,
	arguments_: Record<string, unknown>,
) {
	const result = await client.request(
		{
			method: "tools/call",
			params: {
				name,
				arguments: arguments_,
			},
		},
		CallToolResultSchema,
	);

	const firstContent = result.content[0];
	if (!firstContent || firstContent.type !== "text") {
		throw new Error("Expected text content in MCP tool response");
	}

	return {
		isError: result.isError,
		text: firstContent.text,
		structuredContent: result.structuredContent,
	};
}

describe("Hevy MCP workout detail endpoints mocked tests", () => {
	let server: McpServer | null = null;
	let client: Client | null = null;

	beforeAll(() => {
		nock.disableNetConnect();
	});

	beforeEach(async () => {
		server = new McpServer({
			name: "hevy-mcp-workout-detail-test",
			version: "1.0.0",
		});

		const hevyClient = createClient(MOCK_HEVY_API_KEY, HEVY_API_BASEURL);
		registerWorkoutTools(server, hevyClient, { autoConfirm: true });

		client = new Client({
			name: "hevy-mcp-workout-detail-test-client",
			version: "1.0.0",
		});

		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await Promise.all([
			client.connect(clientTransport),
			server.connect(serverTransport),
		]);
	});

	afterEach(async () => {
		if (client) {
			await client.close();
		}
		if (server) {
			await server.close();
		}

		expect(nock.isDone()).toBe(true);
		nock.cleanAll();
	});

	afterAll(() => {
		nock.enableNetConnect();
	});

	it("mocks get-workout-count through MCP transport", async () => {
		if (!client) throw new Error("Client not initialized");

		getApiScope().get("/v1/workouts/count").reply(200, {
			workout_count: 42,
		});

		const result = await callTool(client, "get-workout-count", {});
		const payload = JSON.parse(result.text) as { count: number };

		expect(result.isError).toBeFalsy();
		expect(payload.count).toBe(42);
		expect(result.structuredContent).toEqual({ count: 42 });
	});

	it("mocks get-workout-events through MCP transport", async () => {
		if (!client) throw new Error("Client not initialized");

		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		try {
			getApiScope()
				.get("/v1/workouts/events")
				.query(true)
				.reply(200, {
					page: 1,
					page_count: 1,
					events: [
						{
							type: "updated",
							workout: {
								id: "workout-1",
								title: "Updated Workout",
								start_time: "2025-03-27T08:00:00Z",
								end_time: "2025-03-27T08:30:00Z",
								exercises: [],
							},
						},
					],
				});

			const result = await callTool(client, "get-workout-events", {
				page: 1,
				pageSize: 5,
				since: "1970-01-01T00:00:00Z",
			});
			const payload = JSON.parse(result.text) as Array<{
				type?: string;
				workout?: { id?: string };
			}>;

			expect(result.isError).toBeFalsy();
			expect(Array.isArray(payload)).toBe(true);
			expect(payload.length).toBeGreaterThan(0);
			expect(payload[0]).toMatchObject({
				type: "updated",
				workout: { id: "workout-1" },
			});
			expect(result.structuredContent).toEqual({ events: payload });
		} finally {
			consoleErrorSpy.mockRestore();
		}
	});

	it("mocks get-workout for a known workout through MCP transport", async () => {
		if (!client) throw new Error("Client not initialized");

		getApiScope().get("/v1/workouts/workout-1").reply(200, {
			id: "workout-1",
			title: "Mock Detail Workout",
			description: "Lower body session",
			start_time: "2025-03-27T07:00:00Z",
			end_time: "2025-03-27T08:00:00Z",
			created_at: "2025-03-27T07:00:00Z",
			updated_at: "2025-03-27T08:00:00Z",
			exercises: [],
		});

		const result = await callTool(client, "get-workout", {
			workoutId: "workout-1",
		});
		const payload = JSON.parse(result.text) as {
			id?: string;
			title?: string;
			duration?: string;
		};

		expect(result.isError).toBeFalsy();
		expect(payload).toMatchObject({
			id: "workout-1",
			title: "Mock Detail Workout",
			duration: "1h 0m 0s",
		});
		expect(result.structuredContent).toEqual({ workout: payload });
	});
});
