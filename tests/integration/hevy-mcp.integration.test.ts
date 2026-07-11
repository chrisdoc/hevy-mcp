// Environment variables are loaded via Node.js native --env-file flag (Node.js 20.6+)
// or set directly in the environment before running tests.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	CallToolResultSchema,
	ErrorCode,
	type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { registerBodyMeasurementTools } from "../../src/tools/body-measurements.js";
import { registerFolderTools } from "../../src/tools/folders.js";
import { registerRoutineTools } from "../../src/tools/routines.js";
import { registerTemplateTools } from "../../src/tools/templates.js";
import { registerUserTools } from "../../src/tools/user.js";
import { registerWorkoutTools } from "../../src/tools/workouts.js";
import { createClient } from "../../src/utils/hevyClient.js";
import {
	bodyMeasurementsOutputSchema,
	exerciseTemplatesOutputSchema,
	routineFoldersOutputSchema,
	routinesOutputSchema,
	userOutputSchema,
	workoutCountOutputSchema,
	workoutEventsOutputSchema,
	workoutsOutputSchema,
} from "../../src/utils/output-schemas.js";

const HEVY_API_BASEURL = "https://api.hevyapp.com";
const liveMode = process.env.HEVY_LIVE_TEST === "1";
const hevyApiKey = process.env.HEVY_API_KEY ?? "";

if (liveMode && !hevyApiKey) {
	throw new Error(
		"HEVY_LIVE_TEST=1 requires HEVY_API_KEY to run credentialed live tests",
	);
}

const describeLive = describe.runIf(liveMode);

function isEmptyStructuredValue(value: unknown): boolean {
	return value === null || (Array.isArray(value) && value.length === 0);
}

function assertReadOutput<
	TShape extends z.ZodRawShape,
	TKey extends keyof TShape & string,
>(
	result: CallToolResult,
	outputSchema: TShape,
	key: TKey,
	options: { emptyText?: RegExp } = {},
): z.output<TShape[TKey]> {
	z.object(outputSchema).parse(result.structuredContent);
	const structuredValue = z.parse(
		outputSchema[key],
		result.structuredContent?.[key],
	);
	const firstContent = result.content[0];

	if (!firstContent || firstContent.type !== "text") {
		throw new Error("Expected text content in MCP tool response");
	}

	try {
		const legacyValue: unknown = JSON.parse(firstContent.text);
		expect(legacyValue).toEqual(structuredValue);
	} catch (error) {
		if (!(error instanceof SyntaxError) || !options.emptyText) {
			throw error;
		}

		expect(firstContent.text).toMatch(options.emptyText);
		expect(isEmptyStructuredValue(structuredValue)).toBe(true);
	}

	return structuredValue;
}

describeLive("Hevy MCP live read-only canaries", () => {
	let server: McpServer | null = null;
	let client: Client | null = null;

	async function callTool(
		name: string,
		arguments_: Record<string, unknown> = {},
	): Promise<CallToolResult> {
		if (!client) throw new Error("Client not initialized");

		return client.request(
			{
				method: "tools/call",
				params: { name, arguments: arguments_ },
			},
			CallToolResultSchema,
		);
	}

	beforeEach(async () => {
		server = new McpServer({
			name: "hevy-mcp-live-test",
			version: "1.0.0",
		});

		const hevyClient = createClient(hevyApiKey, HEVY_API_BASEURL);
		registerWorkoutTools(server, hevyClient);
		registerRoutineTools(server, hevyClient);
		registerTemplateTools(server, hevyClient);
		registerFolderTools(server, hevyClient);
		registerUserTools(server, hevyClient);
		registerBodyMeasurementTools(server, hevyClient);

		client = new Client({
			name: "hevy-mcp-live-test-client",
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
		if (client) await client.close();
		if (server) await server.close();
		client = null;
		server = null;
	});

	afterAll(async () => {
		if (client) await client.close();
		if (server) await server.close();
	});

	describe("handshake and tool inventory", () => {
		it("connects and advertises representative read tools with output schemas", async () => {
			if (!client) throw new Error("Client not initialized");

			await expect(client.ping()).resolves.toBeDefined();
			expect(client.getServerCapabilities()).toHaveProperty("tools");
			expect(client.getServerVersion()).toMatchObject({
				name: "hevy-mcp-live-test",
				version: "1.0.0",
			});

			const { tools } = await client.listTools();
			const representativeReadTools = [
				"get-workouts",
				"get-routines",
				"get-exercise-templates",
				"get-routine-folders",
				"get-body-measurements",
				"get-user-info",
				"get-workout-count",
				"get-workout-events",
			];

			for (const name of representativeReadTools) {
				const tool = tools.find((candidate) => candidate.name === name);
				expect(tool, `${name} inventory entry`).toBeDefined();
				expect(tool?.annotations?.readOnlyHint, `${name} read-only hint`).toBe(
					true,
				);
				expect(tool?.outputSchema, `${name} output schema`).toMatchObject({
					type: "object",
					properties: expect.any(Object),
				});
			}
		});
	});

	describe("representative endpoint shape and production structured-output validation", () => {
		it("validates routines against the production contract", async () => {
			const result = await callTool("get-routines", {
				page: 1,
				pageSize: 5,
			});

			assertReadOutput(result, routinesOutputSchema, "routines", {
				emptyText: /^No routines found/,
			});
		});

		it("validates exercise templates against the production contract", async () => {
			const result = await callTool("get-exercise-templates", {
				page: 1,
				pageSize: 5,
			});

			assertReadOutput(
				result,
				exerciseTemplatesOutputSchema,
				"exerciseTemplates",
				{ emptyText: /^No exercise templates found/ },
			);
		});

		it("validates routine folders against the production contract", async () => {
			const result = await callTool("get-routine-folders", {
				page: 1,
				pageSize: 5,
			});

			assertReadOutput(result, routineFoldersOutputSchema, "routineFolders", {
				emptyText: /^No routine folders found/,
			});
		});

		it("validates body measurements against the production contract", async () => {
			const result = await callTool("get-body-measurements", {
				page: 1,
				pageSize: 5,
			});

			assertReadOutput(
				result,
				bodyMeasurementsOutputSchema,
				"bodyMeasurements",
				{ emptyText: /^No body measurements found/ },
			);
		});

		it("validates user info against the production contract", async () => {
			const result = await callTool("get-user-info");

			assertReadOutput(result, userOutputSchema, "user", {
				emptyText: /^No user info found/,
			});
		});

		it("validates workout events against the production contract", async () => {
			const result = await callTool("get-workout-events", {
				page: 1,
				pageSize: 5,
				since: "1970-01-01T00:00:00Z",
			});

			assertReadOutput(result, workoutEventsOutputSchema, "events", {
				emptyText: /^No workout events found/,
			});
		});
	});

	describe("pagination and count consistency", () => {
		it("keeps adjacent workout pages unique and bounded by total count", async () => {
			const [firstResult, secondResult, countResult] = await Promise.all([
				callTool("get-workouts", { page: 1, pageSize: 2 }),
				callTool("get-workouts", { page: 2, pageSize: 2 }),
				callTool("get-workout-count"),
			]);
			const firstPage = assertReadOutput(
				firstResult,
				workoutsOutputSchema,
				"workouts",
				{ emptyText: /^No workouts found/ },
			);
			const secondPage = assertReadOutput(
				secondResult,
				workoutsOutputSchema,
				"workouts",
				{ emptyText: /^No workouts found/ },
			);
			const count = assertReadOutput(
				countResult,
				workoutCountOutputSchema,
				"count",
			);
			const observedIds = [...firstPage, ...secondPage].map(
				(workout) => workout.id,
			);

			expect(new Set(observedIds).size).toBe(observedIds.length);
			expect(count).toBeGreaterThanOrEqual(new Set(observedIds).size);
		});
	});

	describe("stable error classification", () => {
		it("classifies invalid read input without an upstream request", async () => {
			const result = await callTool("get-workouts", {
				page: 0,
				pageSize: 1,
			});
			const firstContent = result.content[0];

			expect(result.isError).toBe(true);
			expect(result.structuredContent).toBeUndefined();
			expect(firstContent).toMatchObject({ type: "text" });
			if (!firstContent || firstContent.type !== "text") {
				throw new Error("Expected text content in MCP error response");
			}
			expect(firstContent.text).toContain(
				`MCP error ${ErrorCode.InvalidParams}`,
			);
		});
	});
});
