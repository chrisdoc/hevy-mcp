import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";

// Environment variables are loaded via Node.js native --env-file flag (Node.js 20.6+)
// or set directly in the environment before running tests.
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createHevyClient } from "../../packages/hevy-client/src/hevy-client.js";
import { createExerciseTemplateCatalog } from "../../packages/core/src/utils/exercise-template-catalog.js";
import { createToolRuntime } from "../../packages/core/src/tools/tool-runtime.js";
import { registerHevyTools } from "../../packages/core/src/tools/register.js";

const HEVY_API_BASEURL = "https://api.hevyapp.com";
const hevyApiKey = process.env.HEVY_API_KEY || "";
const describeLive = describe.runIf(Boolean(hevyApiKey));

// --- WORKOUTS SCHEMAS ---
const WorkoutSummarySchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	start_time: z.string().optional(),
	end_time: z.string().optional(),
	duration: z.string(),
	exercise_count: z.number().int().nonnegative(),
	set_count: z.number().int().nonnegative(),
});

const GetWorkoutsResponseSchema = z.array(WorkoutSummarySchema);

// --- ROUTINES SCHEMAS ---
const RoutineSummarySchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	folder_id: z.number().optional(),
	updated_at: z.string().optional(),
	exercise_count: z.number().int().nonnegative(),
	set_count: z.number().int().nonnegative(),
});

const GetRoutinesResponseSchema = z.array(RoutineSummarySchema);

// --- BODY MEASUREMENTS SCHEMAS ---
const FormattedBodyMeasurementSchema = z.object({
	date: z.string(),
	weight_kg: z.number().optional(),
	lean_mass_kg: z.number().optional(),
	fat_percent: z.number().optional(),
	neck_cm: z.number().optional(),
	shoulder_cm: z.number().optional(),
	chest_cm: z.number().optional(),
	left_bicep_cm: z.number().optional(),
	right_bicep_cm: z.number().optional(),
	left_forearm_cm: z.number().optional(),
	right_forearm_cm: z.number().optional(),
	abdomen: z.number().optional(),
	waist: z.number().optional(),
	hips: z.number().optional(),
	left_thigh_cm: z.number().optional(),
	right_thigh_cm: z.number().optional(),
	left_calf_cm: z.number().optional(),
	right_calf_cm: z.number().optional(),
});

const GetBodyMeasurementsResponseSchema = z.array(
	FormattedBodyMeasurementSchema,
);

describeLive("Hevy MCP Server Integration Tests", () => {
	let server: McpServer | null = null;
	let client: Client | null = null;

	beforeEach(async () => {
		// Create server instance
		server = new McpServer({
			name: "hevy-mcp-test",
			version: "1.0.0",
		});

		// Create Hevy client
		const hevyClient = createHevyClient({
			apiKey: hevyApiKey,
			baseUrl: HEVY_API_BASEURL,
		});
		const runtime = createToolRuntime({
			client: hevyClient,
			catalog: createExerciseTemplateCatalog(hevyClient),
		});

		registerHevyTools(server, runtime);

		// Create client
		client = new Client({
			name: "hevy-mcp-test-client",
			version: "1.0.0",
		});

		// Connect client and server
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await Promise.all([
			client.connect(clientTransport),
			server.connect(serverTransport),
		]);
	});

	afterEach(async () => {
		if (server) {
			await server.close();
		}
	});

	afterAll(async () => {
		if (client) {
			await client.close();
		}
	});

	describe("Get Workouts", () => {
		it("should be able to get workouts", async () => {
			if (!client) throw new Error("Client not initialized");

			const result = await client.request({
				method: "tools/call",
				params: {
					name: "get-workouts",
					arguments: {
						page: 1,
						page_size: 5,
					},
				},
			});

			expect(result).toBeDefined();
			const firstContent = result.content[0];
			if (firstContent.type !== "text") {
				throw new Error("Expected text content");
			}
			const responseData = JSON.parse(firstContent.text);

			// Validate the response schema with Zod
			GetWorkoutsResponseSchema.parse(responseData);

			expect(responseData).toBeDefined();
			expect(Array.isArray(responseData)).toBe(true);
			expect(responseData.length).toBeGreaterThan(0);
			expect(responseData[0].id).toBeDefined();
			expect(responseData[0].title).toBeDefined();
			expect(responseData[0].title.length).toBeGreaterThanOrEqual(3);
			expect(responseData[0].exercise_count).toBeDefined();
			expect(responseData[0].set_count).toBeDefined();
		});
	});

	describe("Get Routines", () => {
		it("should be able to get routines", async () => {
			if (!client) throw new Error("Client not initialized");

			const result = await client.request({
				method: "tools/call",
				params: {
					name: "get-routines",
					arguments: {
						page: 1,
						page_size: 5,
					},
				},
			});

			expect(result).toBeDefined();
			const firstContent = result.content[0];
			if (firstContent.type !== "text") {
				throw new Error("Expected text content");
			}
			const responseData = JSON.parse(firstContent.text);

			// Validate the response schema with Zod
			GetRoutinesResponseSchema.parse(responseData);

			expect(responseData).toBeDefined();
			expect(Array.isArray(responseData)).toBe(true);
			if (responseData.length > 0) {
				expect(responseData[0].id).toBeDefined();
				expect(responseData[0].exercise_count).toBeDefined();
				expect(responseData[0].set_count).toBeDefined();
				expect(responseData[0].title).toBeDefined();
			}
		});
	});

	describe("Get Body Measurements", () => {
		it("should be able to get body measurements", async () => {
			if (!client) throw new Error("Client not initialized");

			const result = await client.request({
				method: "tools/call",
				params: {
					name: "get-body-measurements",
					arguments: {
						page: 1,
						page_size: 5,
					},
				},
			});

			expect(result).toBeDefined();
			const firstContent = result.content[0];
			if (firstContent.type !== "text") {
				throw new Error("Expected text content");
			}
			const responseData = JSON.parse(firstContent.text);

			// Validate the response schema with Zod
			GetBodyMeasurementsResponseSchema.parse(responseData);

			expect(responseData).toBeDefined();
			expect(Array.isArray(responseData)).toBe(true);
			if (responseData.length > 0) {
				expect(responseData[0].date).toBeDefined();
			}
		});
	});
});
