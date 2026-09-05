import type {
	JSONObject,
	McpServer,
	ReadResourceResult,
} from "@modelcontextprotocol/server";

/* oxlint-disable typescript/unbound-method */
import { Cache, Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import type {
	ExerciseTemplate,
	RoutineFolder,
} from "@hevy-mcp/hevy-client/types";
import { HevyHttpError, type HevyClient } from "@hevy-mcp/hevy-client";
import {
	createOperations,
	foldersListAllDescriptor,
	type TemplatesListAllOperation,
	templatesListAllDescriptor,
	userGetDescriptor,
	workoutsCountDescriptor,
} from "@hevy-mcp/operations";
import type { HevyOperations } from "@hevy-mcp/operations";
import { projectRoutineFolder } from "../utils/formatters.js";
import {
	createExerciseTemplateCatalog,
	type ExerciseTemplateCatalog,
	type ExerciseTemplateCatalogCache,
	EXERCISE_TEMPLATE_CATALOG_CACHE_MAX_SIZE,
	EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS,
} from "../utils/exercise-template-catalog.js";
import { createToolRuntime, type ToolRuntime } from "../tools/tool-runtime.js";
import { registerToolDefinition } from "../tools/define-tool.js";
import { templateToolDefinitions } from "../tools/templates.js";
import { registerHevyResources } from "./hevy.js";
import {
	createMockHevyClient,
	createMockMcpServer,
} from "../../test-fixtures/mock-hevy.js";

function createTestRuntime(
	client: HevyClient | null,
	catalog?: ExerciseTemplateCatalog,
	operationsOverride?: HevyOperations,
) {
	const operations =
		operationsOverride ?? (client ? createOperations(client) : undefined);
	const listAll: TemplatesListAllOperation = {
		descriptor: {
			id: "templates.listAll",
			safety: "read",
		},
		effect: () => Effect.succeed([]),
		execute: () => Promise.resolve([]),
	};
	const cache: ExerciseTemplateCatalogCache = Effect.runSync(
		Cache.make({
			capacity: EXERCISE_TEMPLATE_CATALOG_CACHE_MAX_SIZE,
			timeToLive: EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS,
			lookup: (_key: string) => listAll.effect(),
		}),
	);
	return createToolRuntime({
		client,
		operations,
		catalog:
			catalog ??
			(client
				? createExerciseTemplateCatalog({ templates: { listAll } }, cache)
				: ({} as ExerciseTemplateCatalog)),
	});
}

function registerTemplateDefinitions(server: McpServer, runtime: ToolRuntime) {
	for (const definition of templateToolDefinitions) {
		registerToolDefinition(server, runtime, definition);
	}
}

function createMockServer() {
	const { registerResource, registerTool, server } = createMockMcpServer();
	return { registerResource, server, tool: registerTool };
}

type ResourceTestContext = {
	readonly mcpReq: {
		readonly signal: AbortSignal;
		readonly id: number;
		readonly notify: () => void;
		readonly send: () => void;
	};
};

function createTestContext(id: number): ResourceTestContext {
	return {
		mcpReq: {
			signal: AbortSignal.timeout(1000),
			id,
			notify: vi.fn(),
			send: vi.fn(),
		},
	};
}

function getResourceRegistration(
	registerResource: ReturnType<typeof vi.fn>,
	name: string,
) {
	const match = registerResource.mock.calls.find(
		([resourceName]) => resourceName === name,
	);
	if (!match) {
		throw new Error(`Resource ${name} was not registered`);
	}

	return {
		uri: match[1] as string,
		metadata: match[2] as { description?: string; mimeType?: string },
		handler: match[3] as (
			uri: URL,
			ctx: ResourceTestContext,
		) => Promise<ReadResourceResult>,
	};
}

function getToolHandler(tool: ReturnType<typeof vi.fn>, name: string) {
	const match = tool.mock.calls.find(([toolName]) => toolName === name);
	if (!match) {
		throw new Error(`Tool ${name} was not registered`);
	}

	return match.at(-1) as (args: JSONObject) => Promise<{
		content: Array<{ type: string; text: string }>;
	}>;
}

function parseJsonContent(result: ReadResourceResult) {
	const content = result.contents[0];
	if (!content || !("text" in content)) {
		throw new Error("Expected JSON text resource content");
	}

	return {
		content,
		data: JSON.parse(content.text) as unknown,
	};
}

const benchTemplate: ExerciseTemplate = {
	id: "template-1",
	title: "Bench Press",
	type: "weight_reps",
	primary_muscle_group: "chest",
	secondary_muscle_groups: ["triceps"],
	is_custom: false,
};

describe("registerHevyResources", () => {
	it("registers all four static JSON resources", () => {
		const { registerResource, server } = createMockServer();
		registerHevyResources(server, createTestRuntime(null));

		expect(registerResource).toHaveBeenCalledTimes(4);
		expect(
			registerResource.mock.calls.map(([name, uri, metadata]) => ({
				name,
				uri,
				mimeType: (metadata as { mimeType?: string }).mimeType,
			})),
		).toEqual([
			{
				name: "user-profile",
				uri: "hevy://user",
				mimeType: "application/json",
			},
			{
				name: "workout-count",
				uri: "hevy://workout-count",
				mimeType: "application/json",
			},
			{
				name: "exercise-templates",
				uri: "hevy://exercise-templates",
				mimeType: "application/json",
			},
			{
				name: "routine-folders",
				uri: "hevy://routine-folders",
				mimeType: "application/json",
			},
		]);
	});

	it("returns user and workout count payloads matching their tools", async () => {
		const { registerResource, server } = createMockServer();
		const hevyClient = createMockHevyClient();
		hevyClient.getUserInfo.mockResolvedValue({
			data: {
				id: "user-1",
				name: "Test User",
				url: "https://hevy.com/user/test",
			},
		});
		hevyClient.getWorkoutCount.mockResolvedValue({ workout_count: 42 });
		registerHevyResources(server, createTestRuntime(hevyClient));

		const userRegistration = getResourceRegistration(
			registerResource,
			"user-profile",
		);
		const userResult = await userRegistration.handler(
			new URL(userRegistration.uri),
			createTestContext(1),
		);
		const userContent = parseJsonContent(userResult);
		expect(userContent.content).toMatchObject({
			uri: "hevy://user",
			mimeType: "application/json",
		});
		expect(userContent.data).toEqual({
			id: "user-1",
			name: "Test User",
			url: "https://hevy.com/user/test",
		});

		const countRegistration = getResourceRegistration(
			registerResource,
			"workout-count",
		);
		const countResult = await countRegistration.handler(
			new URL(countRegistration.uri),
			createTestContext(2),
		);
		expect(parseJsonContent(countResult).data).toEqual({ workout_count: 42 });
	});

	it("dispatches every resource through the operations layer", async () => {
		const { registerResource, server } = createMockServer();
		const hevyClient = createMockHevyClient();
		const baseOperations = createOperations(hevyClient);
		const baseTemplates = baseOperations.templates;
		const baseFolders = baseOperations.folders;
		if (!baseTemplates || !baseFolders) {
			throw new Error("Expected template and folder operations");
		}
		const user = {
			id: "user-1",
			name: "Operations User",
			url: "https://hevy.com/user/operations",
		};
		const folders: RoutineFolder[] = [{ id: 1, title: "Operations Folder" }];
		const templates: ExerciseTemplate[] = [
			{ id: "template-1", title: "Operations Template" },
		];
		const userGet = vi.fn(() => Effect.succeed(user));
		const workoutCount = vi.fn(() => Effect.succeed(7));
		const templateListAll = vi.fn(() => Effect.succeed(templates));
		const folderListAll = vi.fn(() => Effect.succeed(folders));
		const operations: HevyOperations = {
			...baseOperations,
			user: {
				get: {
					descriptor: userGetDescriptor,
					effect: userGet,
					execute: vi.fn(),
				},
			},
			workouts: {
				...baseOperations.workouts,
				count: {
					descriptor: workoutsCountDescriptor,
					effect: workoutCount,
					execute: vi.fn(),
				},
			},
			templates: {
				...baseTemplates,
				listAll: {
					descriptor: templatesListAllDescriptor,
					effect: templateListAll,
					execute: vi.fn(),
				},
			},
			folders: {
				...baseFolders,
				listAll: {
					descriptor: foldersListAllDescriptor,
					effect: folderListAll,
					execute: vi.fn(),
				},
			},
		};
		const cache: ExerciseTemplateCatalogCache = Effect.runSync(
			Cache.make<
				string,
				ExerciseTemplate[],
				Effect.Error<ReturnType<TemplatesListAllOperation["effect"]>>
			>({
				capacity: EXERCISE_TEMPLATE_CATALOG_CACHE_MAX_SIZE,
				timeToLive: EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS,
				lookup: (_key: string) => templateListAll(),
			}),
		);
		const catalog = createExerciseTemplateCatalog(operations, cache);
		registerHevyResources(
			server,
			createTestRuntime(hevyClient, catalog, operations),
		);

		const invoke = async (name: string) => {
			const registration = getResourceRegistration(registerResource, name);
			return registration.handler(
				new URL(registration.uri),
				createTestContext(9),
			);
		};

		expect(parseJsonContent(await invoke("user-profile")).data).toEqual(user);
		expect(parseJsonContent(await invoke("workout-count")).data).toEqual({
			workout_count: 7,
		});
		expect(parseJsonContent(await invoke("exercise-templates")).data).toEqual(
			templates,
		);
		expect(parseJsonContent(await invoke("routine-folders")).data).toEqual([
			{ id: 1, title: "Operations Folder" },
		]);

		expect(userGet).toHaveBeenCalledOnce();
		expect(workoutCount).toHaveBeenCalledOnce();
		expect(templateListAll).toHaveBeenCalledOnce();
		expect(folderListAll).toHaveBeenCalledOnce();
		expect(hevyClient.getUserInfo).not.toHaveBeenCalled();
		expect(hevyClient.getWorkoutCount).not.toHaveBeenCalled();
		expect(hevyClient.getExerciseTemplates).not.toHaveBeenCalled();
		expect(hevyClient.getRoutineFolders).not.toHaveBeenCalled();
	});

	it("fetches and formats all routine folder pages", async () => {
		const firstFolder: RoutineFolder = {
			id: 1,
			title: "First",
			created_at: "2025-01-01T00:00:00Z",
			updated_at: "2025-01-01T00:00:00Z",
			index: 0,
		};
		const secondFolder: RoutineFolder = {
			id: 2,
			title: "Second",
			created_at: "2025-01-02T00:00:00Z",
			updated_at: "2025-01-02T00:00:00Z",
			index: 1,
		};
		const { registerResource, server } = createMockServer();
		const hevyClient = createMockHevyClient();
		hevyClient.getRoutineFolders
			.mockResolvedValueOnce({
				page: 1,
				page_count: 2,
				routine_folders: [firstFolder],
			})
			.mockResolvedValueOnce({
				page: 2,
				page_count: 2,
				routine_folders: [secondFolder],
			});
		registerHevyResources(server, createTestRuntime(hevyClient));

		const registration = getResourceRegistration(
			registerResource,
			"routine-folders",
		);
		const result = await registration.handler(
			new URL(registration.uri),
			createTestContext(3),
		);

		expect(vi.mocked(hevyClient.getRoutineFolders)).toHaveBeenNthCalledWith(1, {
			page: 1,
			pageSize: 10,
		});
		expect(vi.mocked(hevyClient.getRoutineFolders)).toHaveBeenNthCalledWith(2, {
			page: 2,
			pageSize: 10,
		});
		const serializedFolders = parseJsonContent(result).data;
		expect(serializedFolders).toEqual([
			projectRoutineFolder(firstFolder),
			projectRoutineFolder(secondFolder),
		]);
		expect(JSON.stringify(serializedFolders)).not.toContain('"index"');
	});

	it("stops safely when routine folder pagination metadata is malformed", async () => {
		const folder: RoutineFolder = {
			id: 1,
			title: "Only page",
			created_at: "2025-01-01T00:00:00Z",
			updated_at: "2025-01-01T00:00:00Z",
		};
		const { registerResource, server } = createMockServer();
		const hevyClient = createMockHevyClient();
		const getRoutineFolders = hevyClient.getRoutineFolders.mockResolvedValue({
			page: 1,
			page_count: 0,
			routine_folders: [folder],
		});
		registerHevyResources(server, createTestRuntime(hevyClient));
		const registration = getResourceRegistration(
			registerResource,
			"routine-folders",
		);

		const result = await registration.handler(
			new URL(registration.uri),
			createTestContext(7),
		);

		expect(getRoutineFolders).toHaveBeenCalledOnce();
		expect(parseJsonContent(result).data).toEqual([
			projectRoutineFolder(folder),
		]);
	});

	it("returns an empty folder resource when the API omits the page", async () => {
		const { registerResource, server } = createMockServer();
		const hevyClient = createMockHevyClient();
		const getRoutineFolders = hevyClient.getRoutineFolders.mockImplementation(
			() => undefined,
		);
		registerHevyResources(server, createTestRuntime(hevyClient));
		const registration = getResourceRegistration(
			registerResource,
			"routine-folders",
		);

		const result = await registration.handler(
			new URL(registration.uri),
			createTestContext(8),
		);

		expect(getRoutineFolders).toHaveBeenCalledOnce();
		expect(parseJsonContent(result).data).toEqual([]);
	});

	it("shares completed and controlled in-flight catalog values", async () => {
		const { registerResource, server, tool } = createMockServer();
		const hevyClient = createMockHevyClient();
		const pendingLookups: Array<(value: ExerciseTemplate[]) => void> = [];
		const listAll = vi
			.fn<TemplatesListAllOperation["effect"]>()
			.mockImplementation(() =>
				Effect.callback<ExerciseTemplate[]>((resume) => {
					pendingLookups.push((value) => resume(Effect.succeed(value)));
				}),
			);
		const operations = {
			templates: {
				listAll: {
					descriptor: {
						id: "templates.listAll" as const,
						safety: "read" as const,
					},
					effect: listAll,
					execute: () => Promise.resolve([]),
				},
			},
		};
		const cache = Effect.runSync(
			Cache.make({
				capacity: EXERCISE_TEMPLATE_CATALOG_CACHE_MAX_SIZE,
				timeToLive: EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS,
				lookup: (_key: string) => listAll(),
			}),
		);
		const catalog = createExerciseTemplateCatalog(operations, cache);
		const runtime = createTestRuntime(hevyClient, catalog);
		registerHevyResources(server, runtime);
		registerTemplateDefinitions(server, runtime);

		const registration = getResourceRegistration(
			registerResource,
			"exercise-templates",
		);
		const resourcePromise = registration.handler(
			new URL(registration.uri),
			createTestContext(4),
		);
		const searchPromise = getToolHandler(
			tool,
			"search-exercise-templates",
		)({
			query: "bench",
			refresh: false,
		});

		await vi.waitFor(() => expect(listAll).toHaveBeenCalledOnce());
		for (const resolveCatalog of pendingLookups) {
			resolveCatalog([benchTemplate]);
		}

		const [resourceResult, searchResult] = await Promise.all([
			resourcePromise,
			searchPromise,
		]);
		expect(parseJsonContent(resourceResult).data).toEqual([benchTemplate]);
		expect(JSON.parse(searchResult.content[0]?.text ?? "null")).toEqual([
			benchTemplate,
		]);
	});

	it("returns structured outcomes for initialization and API failures", async () => {
		const { registerResource, server } = createMockServer();
		registerHevyResources(server, createTestRuntime(null));
		const userRegistration = getResourceRegistration(
			registerResource,
			"user-profile",
		);
		const uninitializedResult = await userRegistration.handler(
			new URL(userRegistration.uri),
			createTestContext(5),
		);
		expect(parseJsonContent(uninitializedResult).data).toEqual({
			error: {
				outcome: "terminal_failure",
				phase: "before-dispatch",
				operation_safety: "read",
				commit_state: "not_sent",
				safe_to_retry: false,
			},
		});

		const apiFailure = new HevyHttpError("Hevy API unavailable", {
			status: 503,
			method: "GET",
			endpoint: "/v1/workouts/count",
			phase: "response-content",
			operationSafety: "read",
			commitState: "not_sent",
			safeToRetry: false,
			outcome: "terminal_failure",
		});
		const failedServer = createMockServer();
		const failedClient = createMockHevyClient();
		failedClient.getWorkoutCount.mockRejectedValue(apiFailure);
		registerHevyResources(failedServer.server, createTestRuntime(failedClient));
		const countRegistration = getResourceRegistration(
			failedServer.registerResource,
			"workout-count",
		);
		const apiFailureResult = await countRegistration.handler(
			new URL(countRegistration.uri),
			createTestContext(6),
		);
		expect(parseJsonContent(apiFailureResult).data).toEqual({
			error: {
				code: "HEVY_RETRY_EXHAUSTED",
				status: 503,
				outcome: "terminal_failure",
				phase: "dispatch",
				operation_safety: "read",
				commit_state: "not_sent",
				safe_to_retry: false,
			},
		});
		expect(JSON.stringify(apiFailureResult)).not.toContain(
			"Hevy API unavailable",
		);
	});
});
