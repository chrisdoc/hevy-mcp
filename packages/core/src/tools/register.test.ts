import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import type { Routine } from "@hevy-mcp/hevy-client/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createToolRuntime } from "./tool-runtime.js";
import {
	registerHevyTools,
	hevyToolDefinitions,
	preloadHevyToolSchemas,
} from "./register.js";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import { createMockHevyClient } from "../../test-fixtures/mock-hevy.js";

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
			anyOf: z.array(schemaObjectSchema).optional(),
		})
		.passthrough(),
);

function schemaProperty(schema: SchemaObject, name: string): SchemaObject {
	const property = schema.properties?.[name];
	if (!property) throw new Error(`Schema property ${name} is missing`);
	return property;
}

function schemaItems(schema: SchemaObject): SchemaObject {
	if (!schema.items) throw new Error("Schema items are missing");
	return schema.items;
}

type ListedTool = {
	readonly name: string;
	readonly inputSchema: unknown;
};

function schemaFor(tools: readonly ListedTool[], name: string): SchemaObject {
	const tool = tools.find(({ name: toolName }) => toolName === name);
	if (!tool) throw new Error(`Tool ${name} is missing`);
	return schemaObjectSchema.parse(tool.inputSchema);
}

function assertRoutineSchemas(tools: readonly ListedTool[]): void {
	const createSchema = schemaFor(tools, "create-routine");
	const updateSchema = schemaFor(tools, "update-routine");
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
}

const createRoutinePayload = {
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

const expectedCreateRoutineRequest = {
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
};

const createdRoutineResponse = {
	id: "routine-1",
	title: "Full Body A",
	folder_id: 123,
	created_at: "2026-08-15T09:00:00Z",
	updated_at: "2026-08-15T09:00:00Z",
	exercises: [
		{
			index: 0,
			title: "Bench Press",
			exercise_template_id: "30E293E3",
			rest_seconds: 120,
			notes: "Controlled active ROM",
			supersets_id: null,
			sets: [
				{
					index: 0,
					type: "normal",
					weight_kg: null,
					reps: null,
					rep_range: { start: 6, end: 10 },
					distance_meters: null,
					duration_seconds: null,
					rpe: null,
					custom_metric: null,
				},
			],
		},
	],
} satisfies Routine;

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

	it("shares memoized tool schemas across independently built servers", async () => {
		preloadHevyToolSchemas();
		preloadHevyToolSchemas();
		const { tools: firstTools } = await client.listTools();

		const catalog: ExerciseTemplateCatalog = {
			get: () => Promise.resolve([]),
			reset: () => {},
		};
		const buildPair = (name: string) => {
			const rebuilt = new McpServer({
				name: `server-${name}`,
				version: "1.0.0",
			});
			registerHevyTools(rebuilt, createToolRuntime({ client: null, catalog }));
			const protocolClient = new Client({
				name: `client-${name}`,
				version: "1.0.0",
			});
			const [clientTransport, serverTransport] =
				InMemoryTransport.createLinkedPair();
			return { rebuilt, protocolClient, clientTransport, serverTransport };
		};
		const second = buildPair("second");
		const third = buildPair("third");
		try {
			await Promise.all([
				second.rebuilt.connect(second.serverTransport),
				second.protocolClient.connect(second.clientTransport),
			]);
			const secondTools = (await second.protocolClient.listTools()).tools;
			expect(secondTools).toEqual(firstTools);

			// The memoized path must also hold through yet another rebuild.
			await Promise.all([
				third.rebuilt.connect(third.serverTransport),
				third.protocolClient.connect(third.clientTransport),
			]);
			const thirdTools = (await third.protocolClient.listTools()).tools;
			expect(thirdTools).toEqual(firstTools);
			expect(thirdTools).toHaveLength(EXPECTED_TOOL_NAMES.length);
		} finally {
			await Promise.all([
				second.protocolClient.close(),
				second.rebuilt.close(),
				third.protocolClient.close(),
				third.rebuilt.close(),
			]);
		}
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
			assertRoutineSchemas(tools);
			const createRoutineTool = tools.find(
				({ name }) => name === "create-routine",
			);
			expect(createRoutineTool?.outputSchema).toBeDefined();
			expect(createRoutineTool?.outputSchema).toMatchObject({
				type: "object",
				properties: {
					created: { const: true },
					commit_state: { const: "confirmed" },
					routine_id: { type: ["string", "null"] },
				},
			});

			const payload = createRoutinePayload;
			mockClient.createRoutine.mockResolvedValue(createdRoutineResponse);

			const result = await protocolClient.callTool({
				name: "create-routine",
				arguments: payload,
			});
			expect(result).not.toMatchObject({ isError: true });
			expect(result.content[0]).toMatchObject({
				type: "text",
				text: expect.stringContaining('"id": "routine-1"'),
			});
			expect(result.content[0]).toMatchObject({
				text: expect.stringContaining('"exercise_template_id": "30E293E3"'),
			});
			expect(mockClient.createRoutine).toHaveBeenCalledTimes(1);
			expect(mockClient.createRoutine.mock.calls[0]?.[0]).toEqual(
				expectedCreateRoutineRequest,
			);

			mockClient.createRoutine.mockResolvedValue(undefined);
			const emptyResult = await protocolClient.callTool({
				name: "create-routine",
				arguments: payload,
			});
			expect(emptyResult).not.toMatchObject({ isError: true });
			expect(emptyResult.structuredContent).toMatchObject({
				created: true,
				commit_state: "confirmed",
				routine: null,
				routine_id: null,
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
			expect(mockClient.createRoutine).toHaveBeenCalledTimes(2);

			const missingExercisesResult = await protocolClient.callTool({
				name: "create-routine",
				arguments: { routine: { title: "No Exercises" } },
			});
			const missingExercisesText = JSON.stringify(missingExercisesResult);
			expect(missingExercisesResult).toMatchObject({ isError: true });
			expect(missingExercisesText).toContain("routine.exercises");
			expect(mockClient.createRoutine).toHaveBeenCalledTimes(2);
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
			if (schema.anyOf) {
				for (const branch of schema.anyOf) visit(branch);
			}
		};
		for (const tool of tools) {
			visit(schemaObjectSchema.parse(tool.inputSchema));
		}
		expect(
			propertyNames.filter((name) => !/^[a-z][a-z0-9_]*$/u.test(name)),
		).toEqual([]);
	});
});
