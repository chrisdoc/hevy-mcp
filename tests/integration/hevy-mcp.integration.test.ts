// Environment variables are loaded via Node.js native --env-file flag (Node.js 20.6+)
// or set directly in the environment before running tests.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { registerWorkoutTools } from "../../src/tools/workouts.js";
import { registerRoutineTools } from "../../src/tools/routines.js";
import { registerTemplateTools } from "../../src/tools/templates.js";
import { registerFolderTools } from "../../src/tools/folders.js";
import { registerUserTools } from "../../src/tools/user.js";
import { registerBodyMeasurementTools } from "../../src/tools/body-measurements.js";
import { createClient } from "../../src/utils/hevyClient.js";

const HEVY_API_BASEURL = "https://api.hevyapp.com";
const hevyApiKey = process.env.HEVY_API_KEY || "";
const describeLive = describe.runIf(Boolean(hevyApiKey));

// --- WORKOUTS SCHEMAS ---
const FormattedWorkoutSetSchema = z.object({
	type: z.string().optional(),
	weight: z.number().nullable().optional(),
	reps: z.number().nullable().optional(),
	distance: z.number().nullable().optional(),
	duration: z.number().nullable().optional(),
	rpe: z.number().nullable().optional(),
	customMetric: z.number().nullable().optional(),
});

const FormattedWorkoutExerciseSchema = z.object({
	name: z.string().optional(),
	notes: z.string().nullable().optional(),
	sets: z.array(FormattedWorkoutSetSchema).optional(),
});

const FormattedWorkoutSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	description: z.string().nullable().optional(),
	startTime: z.union([z.string(), z.number()]).optional(),
	endTime: z.union([z.string(), z.number()]).optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
	duration: z.string(),
	exercises: z.array(FormattedWorkoutExerciseSchema).optional(),
});

const GetWorkoutsResponseSchema = z.array(FormattedWorkoutSchema);

// --- ROUTINES SCHEMAS ---
const FormattedRoutineSetSchema = z.object({
	index: z.number().optional(),
	type: z.string().optional(),
	weight: z.number().nullable().optional(),
	reps: z.number().nullable().optional(),
	distance: z.number().nullable().optional(),
	duration: z.number().nullable().optional(),
	customMetric: z.number().nullable().optional(),
	repRange: z
		.object({
			start: z.number().nullable().optional(),
			end: z.number().nullable().optional(),
		})
		.nullable()
		.optional(),
	rpe: z.number().nullable().optional(),
});

const FormattedRoutineExerciseSchema = z.object({
	name: z.string().optional(),
	index: z.number().optional(),
	exerciseTemplateId: z.string().optional(),
	notes: z.string().nullable().optional(),
	supersetId: z.number().nullable().optional(),
	restSeconds: z.union([z.string(), z.number()]).nullable().optional(),
	sets: z.array(FormattedRoutineSetSchema).optional(),
});

const FormattedRoutineSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	folderId: z.number().nullable().optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
	exercises: z.array(FormattedRoutineExerciseSchema).optional(),
});

const GetRoutinesResponseSchema = z.array(FormattedRoutineSchema);

// --- EXERCISE TEMPLATES SCHEMAS ---
const FormattedExerciseTemplateSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	type: z.string().optional(),
	primaryMuscleGroup: z.string().optional(),
	secondaryMuscleGroups: z.array(z.string()).optional(),
	isCustom: z.boolean().optional(),
});

const GetExerciseTemplatesResponseSchema = z.array(
	FormattedExerciseTemplateSchema,
);

// --- ROUTINE FOLDERS SCHEMAS ---
const FormattedRoutineFolderSchema = z.object({
	id: z.number().optional(),
	title: z.string().optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});

const GetRoutineFoldersResponseSchema = z.array(FormattedRoutineFolderSchema);

// --- USER SCHEMAS ---
const UserInfoResponseSchema = z.object({
	id: z.string().optional(),
	name: z.string().optional(),
	url: z.string().nullable().optional(),
});

// --- BODY MEASUREMENTS SCHEMAS ---
const FormattedBodyMeasurementSchema = z.object({
	date: z.string(),
	weightKg: z.number().nullable(),
	leanMassKg: z.number().nullable(),
	fatPercent: z.number().nullable(),
	neckCm: z.number().nullable(),
	shoulderCm: z.number().nullable(),
	chestCm: z.number().nullable(),
	leftBicepCm: z.number().nullable(),
	rightBicepCm: z.number().nullable(),
	leftForearmCm: z.number().nullable(),
	rightForearmCm: z.number().nullable(),
	abdomen: z.number().nullable(),
	waist: z.number().nullable(),
	hips: z.number().nullable(),
	leftThigh: z.number().nullable(),
	rightThigh: z.number().nullable(),
	leftCalf: z.number().nullable(),
	rightCalf: z.number().nullable(),
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
		const hevyClient = createClient(hevyApiKey, HEVY_API_BASEURL);

		// Register all tool groups
		registerWorkoutTools(server, hevyClient);
		registerRoutineTools(server, hevyClient);
		registerTemplateTools(server, hevyClient);
		registerFolderTools(server, hevyClient);
		registerUserTools(server, hevyClient);
		registerBodyMeasurementTools(server, hevyClient);

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

			const result = await client.request(
				{
					method: "tools/call",
					params: {
						name: "get-workouts",
						arguments: {
							page: 1,
							pageSize: 5,
						},
					},
				},
				CallToolResultSchema,
			);

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
			expect(responseData[0].createdAt).toBeDefined();
		});
	});

	describe("Get Routines", () => {
		it("should be able to get routines", async () => {
			if (!client) throw new Error("Client not initialized");

			const result = await client.request(
				{
					method: "tools/call",
					params: {
						name: "get-routines",
						arguments: {
							page: 1,
							pageSize: 5,
						},
					},
				},
				CallToolResultSchema,
			);

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
				expect(responseData[0].title).toBeDefined();
			}
		});
	});

	describe("Get Exercise Templates", () => {
		it("should be able to get exercise templates", async () => {
			if (!client) throw new Error("Client not initialized");

			const result = await client.request(
				{
					method: "tools/call",
					params: {
						name: "get-exercise-templates",
						arguments: {
							page: 1,
							pageSize: 5,
						},
					},
				},
				CallToolResultSchema,
			);

			expect(result).toBeDefined();
			const firstContent = result.content[0];
			if (firstContent.type !== "text") {
				throw new Error("Expected text content");
			}
			const responseData = JSON.parse(firstContent.text);

			// Validate the response schema with Zod
			GetExerciseTemplatesResponseSchema.parse(responseData);

			expect(responseData).toBeDefined();
			expect(Array.isArray(responseData)).toBe(true);
			expect(responseData.length).toBeGreaterThan(0);
			expect(responseData[0].id).toBeDefined();
			expect(responseData[0].title).toBeDefined();
		});
	});

	describe("Get Routine Folders", () => {
		it("should be able to get routine folders", async () => {
			if (!client) throw new Error("Client not initialized");

			const result = await client.request(
				{
					method: "tools/call",
					params: {
						name: "get-routine-folders",
						arguments: {
							page: 1,
							pageSize: 5,
						},
					},
				},
				CallToolResultSchema,
			);

			expect(result).toBeDefined();
			const firstContent = result.content[0];
			if (firstContent.type !== "text") {
				throw new Error("Expected text content");
			}
			const responseData = JSON.parse(firstContent.text);

			// Validate the response schema with Zod
			GetRoutineFoldersResponseSchema.parse(responseData);

			expect(responseData).toBeDefined();
			expect(Array.isArray(responseData)).toBe(true);
			if (responseData.length > 0) {
				expect(responseData[0].id).toBeDefined();
				expect(responseData[0].title).toBeDefined();
			}
		});
	});

	describe("Get User Info", () => {
		it("should be able to get user info", async () => {
			if (!client) throw new Error("Client not initialized");

			const result = await client.request(
				{
					method: "tools/call",
					params: {
						name: "get-user-info",
						arguments: {},
					},
				},
				CallToolResultSchema,
			);

			expect(result).toBeDefined();
			const firstContent = result.content[0];
			if (firstContent.type !== "text") {
				throw new Error("Expected text content");
			}
			const responseData = JSON.parse(firstContent.text);

			// Validate the response schema with Zod
			UserInfoResponseSchema.parse(responseData);

			expect(responseData).toBeDefined();
			expect(responseData.name).toBeDefined();
		});
	});

	describe("Get Body Measurements", () => {
		it("should be able to get body measurements", async () => {
			if (!client) throw new Error("Client not initialized");

			const result = await client.request(
				{
					method: "tools/call",
					params: {
						name: "get-body-measurements",
						arguments: {
							page: 1,
							pageSize: 5,
						},
					},
				},
				CallToolResultSchema,
			);

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
