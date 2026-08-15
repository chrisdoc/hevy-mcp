import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createToolRuntime } from "./tool-runtime.js";
import { registerHevyTools, hevyToolDefinitions } from "./register.js";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";

type SchemaObject = {
	readonly type?: string | readonly string[];
	readonly properties?: Record<string, SchemaObject>;
	readonly items?: SchemaObject;
	readonly anyOf?: readonly SchemaObject[];
	readonly required?: readonly string[];
	readonly additionalProperties?: boolean;
};

const schemaObjectSchema: z.ZodType<SchemaObject> = z.lazy(() =>
	z
		.object({
			properties: z.record(z.string(), schemaObjectSchema).optional(),
			items: schemaObjectSchema.optional(),
		})
		.passthrough(),
);

function createMockHevyClient() {
	return {
		getWorkouts: vi.fn(),
		getWorkout: vi.fn(),
		createWorkout: vi.fn(),
		updateWorkout: vi.fn(),
		getWorkoutCount: vi.fn(),
		getWorkoutEvents: vi.fn(),
		getRoutines: vi.fn(),
		getRoutineById: vi.fn(),
		createRoutine: vi.fn(),
		updateRoutine: vi.fn(),
		getExerciseTemplates: vi.fn(),
		getExerciseTemplate: vi.fn(),
		getExerciseHistory: vi.fn(),
		createExerciseTemplate: vi.fn(),
		getRoutineFolders: vi.fn(),
		createRoutineFolder: vi.fn(),
		getRoutineFolder: vi.fn(),
		getBodyMeasurements: vi.fn(),
		getBodyMeasurement: vi.fn(),
		createBodyMeasurement: vi.fn(),
		updateBodyMeasurement: vi.fn(),
		getUserInfo: vi.fn(),
	} satisfies HevyClient;
}

function schemaProperty(schema: SchemaObject, name: string): SchemaObject {
	const property = schema.properties?.[name];
	if (!property) throw new Error(`Schema property ${name} is missing`);
	return property;
}

function schemaItems(schema: SchemaObject): SchemaObject {
	if (!schema.items) throw new Error("Schema items are missing");
	return schema.items;
}

const EXPECTED_TOOL_NAMES = [
	"get-workouts",
	"get-workout",

	"get-workout-events",
	"create-workout",
	"update-workout",
	"replace-workout-exercises",
	"get-routines",
	"get-routine",
	"create-routine",
	"update-routine",

	"get-exercise-template",
	"get-exercise-history",
	"create-exercise-template",
	"search-exercise-templates",

	"get-routine-folder",
	"create-routine-folder",
	"get-body-measurements",
	"get-body-measurement",
	"create-body-measurement",
	"update-body-measurement",

	"get-training-summary",
	"search-routines",
] as const;

describe("registerHevyTools", () => {
	let client: Client;
	let server: McpServer;

	beforeEach(async () => {
		server = new McpServer({ name: "tool-list-test", version: "1.0.0" });
		const catalog: ExerciseTemplateCatalog = {
			get: () => Promise.resolve([]),
			reset: () => {},
		};
		registerHevyTools(
			server,
			createToolRuntime({
				client: null,
				catalog,
			}),
		);
		client = new Client({ name: "tool-list-client", version: "1.0.0" });

		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await Promise.all([
			server.connect(serverTransport),
			client.connect(clientTransport),
		]);
	});

	afterEach(async () => {
		await Promise.all([client.close(), server.close()]);
	});

	it("advertises the complete production tool set without an API client", async () => {
		const { tools } = await client.listTools();

		expect(tools).toHaveLength(EXPECTED_TOOL_NAMES.length);
		expect(tools.map(({ name }) => name)).toEqual(EXPECTED_TOOL_NAMES);
	});

	it("advertises the non-empty update-workout patch invariant", async () => {
		const { tools } = await client.listTools();
		const updateWorkout = tools.find(({ name }) => name === "update-workout");

		expect(updateWorkout).toBeDefined();
		expect(updateWorkout?.inputSchema).toEqual(
			expect.objectContaining({
				required: expect.arrayContaining(["workout"]),
				properties: expect.objectContaining({
					workout: expect.objectContaining({
						type: "object",
						additionalProperties: false,
						minProperties: 1,
					}),
				}),
			}),
		);
	});
	it("keeps the serialized create-routine contract aligned with dispatch", async () => {
		const mockClient = createMockHevyClient();
		const productionServer = new McpServer({
			name: "create-routine-contract-server",
			version: "1.0.0",
		});
		const catalog: ExerciseTemplateCatalog = {
			get: () => Promise.resolve([]),
			reset: () => {},
		};
		registerHevyTools(
			productionServer,
			createToolRuntime({
				client: mockClient,
				catalog,
			}),
		);
		const protocolClient = new Client({
			name: "create-routine-contract-client",
			version: "1.0.0",
		});
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();

		try {
			await Promise.all([
				productionServer.connect(serverTransport),
				protocolClient.connect(clientTransport),
			]);

			const { tools } = await protocolClient.listTools();
			const createRoutineTool = tools.find(
				({ name }) => name === "create-routine",
			);
			const updateRoutineTool = tools.find(
				({ name }) => name === "update-routine",
			);
			if (!createRoutineTool || !updateRoutineTool) {
				throw new Error("Routine mutation tools are missing");
			}

			const createSchema = createRoutineTool.inputSchema as SchemaObject;
			const updateSchema = updateRoutineTool.inputSchema as SchemaObject;
			expect(createSchema).toEqual(
				expect.objectContaining({
					additionalProperties: false,
					required: ["routine"],
				}),
			);
			expect(updateSchema).toEqual(
				expect.objectContaining({
					additionalProperties: false,
					required: ["routine_id", "routine"],
				}),
			);

			const createRoutineSchema = schemaProperty(createSchema, "routine");
			const updateRoutineSchema = schemaProperty(updateSchema, "routine");
			expect(createRoutineSchema).toEqual(
				expect.objectContaining({
					additionalProperties: false,
					required: expect.arrayContaining(["title", "exercises"]),
				}),
			);
			expect(updateRoutineSchema).toEqual(
				expect.objectContaining({
					additionalProperties: false,
					required: expect.arrayContaining(["title", "exercises"]),
				}),
			);

			const exerciseSchema = schemaItems(
				schemaProperty(createRoutineSchema, "exercises"),
			);
			expect(exerciseSchema).toEqual(
				expect.objectContaining({
					additionalProperties: false,
					required: expect.arrayContaining(["exercise_template_id", "sets"]),
				}),
			);
			expect(schemaProperty(exerciseSchema, "superset_id")).toEqual(
				expect.objectContaining({
					type: expect.arrayContaining(["number", "null"]),
				}),
			);
			expect(schemaProperty(exerciseSchema, "rest_seconds")).toEqual(
				expect.objectContaining({ type: "integer" }),
			);
			const repRangeSchema = schemaProperty(
				schemaItems(schemaProperty(exerciseSchema, "sets")),
				"rep_range",
			);
			expect(repRangeSchema).toEqual(
				expect.objectContaining({
					type: "object",
					additionalProperties: false,
					properties: expect.objectContaining({
						start: expect.objectContaining({
							type: expect.arrayContaining(["integer", "null"]),
						}),
						end: expect.objectContaining({
							type: expect.arrayContaining(["integer", "null"]),
						}),
					}),
				}),
			);

			const payload = {
				routine: {
					title: "Full Body A",
					folder_id: 123,
					notes: "First four exercises are the minimum viable workout",
					exercises: [
						{
							exercise_template_id: "30E293E3",
							superset_id: null,
							rest_seconds: 120,
							notes: "Controlled active ROM",
							sets: [
								{
									type: "normal",
									rep_range: {
										start: 6,
										end: 10,
									},
								},
							],
						},
					],
				},
			};
			mockClient.createRoutine.mockResolvedValue(payload.routine);

			const result = await protocolClient.callTool({
				name: "create-routine",
				arguments: payload,
			});
			expect(result).not.toMatchObject({ isError: true });
			expect(mockClient.createRoutine).toHaveBeenCalledTimes(1);
			expect(mockClient.createRoutine.mock.calls[0]?.[0]).toEqual({
				routine: {
					title: "Full Body A",
					folder_id: 123,
					notes: "First four exercises are the minimum viable workout",
					exercises: [
						{
							exercise_template_id: "30E293E3",
							superset_id: null,
							rest_seconds: 120,
							notes: "Controlled active ROM",
							sets: [
								{
									type: "normal",
									weight_kg: null,
									reps: null,
									distance_meters: null,
									duration_seconds: null,
									custom_metric: null,
									rep_range: {
										start: 6,
										end: 10,
									},
								},
							],
						},
					],
				},
			});

			const invalidResult = await protocolClient.callTool({
				name: "create-routine",
				arguments: {
					routine: {
						title: "SECRET-TITLE-SENTINEL",
						notes: "SECRET-NOTES-SENTINEL",
						exercises: [
							{
								exercise_template_id: "SECRET-TEMPLATE-SENTINEL",
								restSeconds: 120,
								sets: [{ type: "normal" }],
							},
						],
					},
				},
			});
			const invalidText = JSON.stringify(invalidResult);
			expect(invalidResult).toMatchObject({ isError: true });
			expect(invalidText).toContain("routine.exercises.0");
			expect(invalidText).toContain("restSeconds");
			expect(invalidText).not.toContain("SECRET-TITLE-SENTINEL");
			expect(invalidText).not.toContain("SECRET-NOTES-SENTINEL");
			expect(invalidText).not.toContain("SECRET-TEMPLATE-SENTINEL");
			expect(mockClient.createRoutine).toHaveBeenCalledTimes(1);
		} finally {
			await Promise.all([protocolClient.close(), productionServer.close()]);
		}
	});

	it("declares bounded feature, kind, and operation metadata for every tool", () => {
		expect(hevyToolDefinitions).toHaveLength(EXPECTED_TOOL_NAMES.length);
		for (const definition of hevyToolDefinitions) {
			expect([
				"workouts",
				"routines",
				"templates",
				"measurements",
				"folders",
				"profile",
				"workflows",
			]).toContain(definition.feature);
			expect(["read", "write"]).toContain(definition.kind);
			expect([
				"list",
				"get",
				"search",
				"create",
				"update",
				"count",
				"sync",
			]).toContain(definition.operation);
		}
	});

	it("advertises output schemas for read tools", async () => {
		const { tools } = await client.listTools();
		const summary = tools.find(({ name }) => name === "get-training-summary");

		expect(summary?.outputSchema).toBeDefined();
	});
	it("exposes only snake_case public input property names", async () => {
		const { tools } = await client.listTools();
		const propertyNames: string[] = [];
		const visit = (schema: SchemaObject): void => {
			if (schema.properties) {
				for (const [name, child] of Object.entries(schema.properties)) {
					propertyNames.push(name);
					visit(child);
				}
			}
			if (schema.items) visit(schema.items);
		};
		for (const tool of tools) {
			const parsed = schemaObjectSchema.safeParse(tool.inputSchema);
			if (parsed.success) visit(parsed.data);
		}
		expect(
			propertyNames.filter((name) => !/^[a-z][a-z0-9_]*$/u.test(name)),
		).toEqual([]);
	});
});
