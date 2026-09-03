import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { Effect } from "effect";
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
import type { ToolObserver } from "../observation.js";

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

const validRoutine = {
	title: "Test Routine",
	exercises: [
		{
			exercise_template_id: "template-1",
			sets: [{ type: "normal" }],
		},
	],
};

const VALID_CALL_ARGUMENTS = {
	"get-workouts": { page: 1 },
	"get-workout": { workout_id: "workout-1" },
	"get-workout-events": { page: 1 },
	"create-workout": {
		workout: {
			title: "Test Workout",
			start_time: "2026-01-01T00:00:00Z",
			end_time: "2026-01-01T01:00:00Z",
			is_private: false,
			exercises: [],
		},
	},
	"update-workout": {
		workout_id: "workout-1",
		workout: { title: "Updated Workout", is_private: false },
	},
	"replace-workout-exercises": {
		workout_id: "workout-1",
		workout: { is_private: false, exercises: [] },
	},
	"get-routines": { page: 1 },
	"get-routine": { routine_id: "routine-1" },
	"create-routine": { routine: validRoutine },
	"update-routine": { routine_id: "routine-1", routine: validRoutine },
	"get-exercise-template": { exercise_template_id: "template-1" },
	"get-exercise-history": { exercise_template_id: "template-1" },
	"create-exercise-template": {
		exercise: {
			title: "Test Template",
			exercise_type: "weight_reps",
			equipment_category: "none",
			muscle_group: "chest",
		},
	},
	"search-exercise-templates": { query: "test" },
	"get-routine-folder": { folder_id: "folder-1" },
	"create-routine-folder": { routine_folder: { title: "Test Folder" } },
	"get-body-measurements": { page: 1 },
	"get-body-measurement": { date: "2026-01-01" },
	"create-body-measurement": { date: "2026-01-01", weight_kg: 80 },
	"update-body-measurement": { date: "2026-01-01", weight_kg: 81 },
	"get-training-summary": {},
	"search-routines": { query: "test" },
} as const;

const completeWorkout = {
	id: "workout-1",
	title: "Test Workout",
	start_time: "2026-01-01T00:00:00Z",
	end_time: "2026-01-01T01:00:00Z",
	exercises: [],
};

function configureRegisterCallClient() {
	const mockClient = createMockHevyClient();
	mockClient.getWorkouts.mockResolvedValue({
		page: 1,
		page_count: 1,
		workouts: [],
	});
	mockClient.getWorkout.mockResolvedValue(completeWorkout);
	mockClient.getRoutines.mockResolvedValue({
		page: 1,
		page_count: 1,
		routines: [],
	});
	mockClient.getRoutineById.mockResolvedValue({
		routine: {
			id: "routine-1",
			title: "Test Routine",
			exercises: [],
		},
	});
	mockClient.getWorkoutEvents.mockResolvedValue({
		page: 1,
		page_count: 1,
		events: [],
	});
	return mockClient;
}

async function connectToolProtocol(
	server: McpServer,
	name: string,
): Promise<{
	readonly protocolClient: Client;
	readonly server: McpServer;
}> {
	const protocolClient = new Client({
		name: `tool-contract-client-${name}`,
		version: "1.0.0",
	});
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await Promise.all([
		server.connect(serverTransport),
		protocolClient.connect(clientTransport),
	]);
	return { protocolClient, server };
}

describe("registerHevyTools", () => {
	let client: Client;
	let server: McpServer;

	beforeEach(async () => {
		server = new McpServer({ name: "tool-list-test", version: "1.0.0" });
		const catalog: ExerciseTemplateCatalog = {
			effect: () => Effect.succeed([]),
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

	it("[VAL-MCP-001] advertises exactly 22 production tools without an API client", async () => {
		const { tools } = await client.listTools();

		expect(EXPECTED_TOOL_NAMES).toHaveLength(22);
		expect(tools).toHaveLength(EXPECTED_TOOL_NAMES.length);
		expect(tools.map(({ name }) => name)).toEqual(EXPECTED_TOOL_NAMES);
	});

	it("[VAL-MCP-005] keeps the protocol catalog at 22 tools and excludes get-user-info", async () => {
		const { tools } = await client.listTools();

		expect(tools.map(({ name }) => name)).toEqual(EXPECTED_TOOL_NAMES);
		expect(tools.map(({ name }) => name)).not.toContain("get-user-info");
	});

	it("[VAL-MCP-006] rejects callTool for the intentionally unregistered get-user-info tool", async () => {
		await expect(
			client.callTool({ name: "get-user-info", arguments: {} }),
		).rejects.toThrow(/unknown|not found/u);
	});

	it("[VAL-MCP-008] keeps every registered tool callable through the protocol path", async () => {
		const mockClient = configureRegisterCallClient();
		const productionServer = new McpServer({
			name: "all-tool-call-server",
			version: "1.0.0",
		});
		const catalog: ExerciseTemplateCatalog = {
			effect: () => Effect.succeed([]),
			get: () => Promise.resolve([]),
			reset: () => {},
		};
		registerHevyTools(
			productionServer,
			createToolRuntime({ client: mockClient, catalog }),
		);
		const pair = await connectToolProtocol(productionServer, "all");

		try {
			for (const name of EXPECTED_TOOL_NAMES) {
				const result = await pair.protocolClient.callTool({
					name,
					arguments: VALID_CALL_ARGUMENTS[name],
				});
				expect(result, name).not.toMatchObject({ isError: true });
				expect(result.content, name).toBeDefined();
				expect(JSON.stringify(result), name).not.toMatch(/Effect|Cause|Layer/u);
			}
		} finally {
			await Promise.all([pair.protocolClient.close(), pair.server.close()]);
		}
	});

	it("[VAL-MCP-002/003/007] keeps listTools and callTool JSON unchanged when an observer is configured", async () => {
		const buildServer = async (
			name: string,
			observer?: ToolObserver,
		): Promise<{
			readonly protocolClient: Client;
			readonly server: McpServer;
		}> => {
			const mockClient = configureRegisterCallClient();
			const server = new McpServer({
				name: `${name}-server`,
				version: "1.0.0",
			});
			const catalog: ExerciseTemplateCatalog = {
				effect: () => Effect.succeed([]),
				get: () => Promise.resolve([]),
				reset: () => {},
			};
			registerHevyTools(
				server,
				createToolRuntime({ client: mockClient, catalog, observer }),
			);
			return connectToolProtocol(server, name);
		};
		const observer: ToolObserver = {
			start: () => ({
				run: <T>(operation: () => Promise<T>) => operation(),
				finish: () => {},
			}),
		};
		const withoutObserver = await buildServer("without-observer");
		const withObserver = await buildServer("with-observer", observer);

		try {
			const [withoutTools, withTools] = await Promise.all([
				withoutObserver.protocolClient.listTools(),
				withObserver.protocolClient.listTools(),
			]);
			expect(withTools).toEqual(withoutTools);

			const [withoutResult, withResult] = await Promise.all([
				withoutObserver.protocolClient.callTool({
					name: "get-workout",
					arguments: { workout_id: "workout-1" },
				}),
				withObserver.protocolClient.callTool({
					name: "get-workout",
					arguments: { workout_id: "workout-1" },
				}),
			]);
			expect(withResult).toEqual(withoutResult);
			expect(JSON.stringify(withResult)).not.toMatch(/Effect|Cause|Layer/u);
		} finally {
			await Promise.all([
				withoutObserver.protocolClient.close(),
				withoutObserver.server.close(),
				withObserver.protocolClient.close(),
				withObserver.server.close(),
			]);
		}
	});

	it("shares memoized tool schemas across independently built servers", async () => {
		preloadHevyToolSchemas();
		preloadHevyToolSchemas();
		const { tools: firstTools } = await client.listTools();

		const catalog: ExerciseTemplateCatalog = {
			effect: () => Effect.succeed([]),
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
			effect: () => Effect.succeed([]),
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
