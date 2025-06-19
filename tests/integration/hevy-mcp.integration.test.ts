import { config } from "dotenv";
config();
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";
import { z } from "zod";
import { registerWorkoutTools } from "../../src/tools/workouts.js";
import { createClient } from "../../src/utils/hevyClient.js";

const HEVY_API_BASEURL = "https://api.hevyapp.com";

// Zod schema for a formatted workout set
const FormattedWorkoutSetSchema = z.object({
	type: z.string().optional(),
	weight: z.number().nullable().optional(),
	reps: z.number().nullable().optional(),
	distance: z.number().nullable().optional(),
	duration: z.number().nullable().optional(),
	rpe: z.number().nullable().optional(),
	customMetric: z.number().nullable().optional(),
});

// Zod schema for a formatted workout exercise
const FormattedWorkoutExerciseSchema = z.object({
	name: z.string().optional(),
	notes: z.string().nullable().optional(),
	sets: z.array(FormattedWorkoutSetSchema).optional(),
});

// Zod schema for a formatted workout
const FormattedWorkoutSchema = z.object({
	id: z.string().optional(),
	date: z.string().optional(),
	name: z.string().optional(),
	description: z.string().nullable().optional(),
	duration: z.string(),
	exercises: z.array(FormattedWorkoutExerciseSchema).optional(),
});

// Zod schema for the get-workouts response (array of formatted workouts)
const GetWorkoutsResponseSchema = z.array(FormattedWorkoutSchema);

describe("Hevy MCP Server Integration Tests", () => {
	let server: McpServer | null = null;
	let client: Client | null = null;
	let hevyApiKey: string;
	let hasApiKey = false;

	beforeAll(() => {
		hevyApiKey = process.env.HEVY_API_KEY || "";
		hasApiKey = !!hevyApiKey;

		if (!hasApiKey) {
			throw new Error(
				"HEVY_API_KEY is not set in environment variables. Integration tests cannot run without a valid API key.\n\n" +
					"For local development:\n" +
					"1. Create a .env file in the project root\n" +
					"2. Add HEVY_API_KEY=your_api_key to the file\n\n" +
					"For GitHub Actions:\n" +
					"1. Go to your GitHub repository\n" +
					"2. Click on Settings > Secrets and variables > Actions\n" +
					"3. Click on New repository secret\n" +
					"4. Set the name to HEVY_API_KEY and the value to your Hevy API key\n" +
					"5. Click Add secret",
			);
		}
	});

	beforeEach(async () => {
		// Create server instance
		server = new McpServer({
			name: "hevy-mcp-test",
			version: "1.0.0",
		});

		// Create Hevy client
		const hevyClient = createClient(hevyApiKey, HEVY_API_BASEURL);

		// Register tools
		registerWorkoutTools(server, hevyClient);

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
			const args = {
				page: 1,
				pageSize: 5,
			};

			if (!client) throw new Error("Client not initialized");

			const result = await client.request(
				{
					method: "tools/call",
					params: {
						name: "get-workouts",
						arguments: args,
					},
				},
				CallToolResultSchema,
			);

			expect(result).toBeDefined();
			const responseData = JSON.parse(result.content[0].text as string);

			// Validate the response schema with Zod
			GetWorkoutsResponseSchema.parse(responseData);

			expect(responseData).toBeDefined();
			expect(Array.isArray(responseData)).toBe(true);
			expect(responseData.length).toBeGreaterThan(0);
			expect(responseData[0].id).toBeDefined();
			expect(responseData[0].name).toBeDefined(); // title is formatted as name
			expect(responseData[0].date).toBeDefined(); // start_time is formatted as date
		});
	});
});
