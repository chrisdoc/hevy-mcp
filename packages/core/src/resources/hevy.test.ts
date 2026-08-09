import type {
	McpServer,
	ReadResourceResult,
} from "@modelcontextprotocol/server";

/* oxlint-disable typescript/unbound-method */
import { describe, expect, it, vi } from "vitest";
import type {
	ExerciseTemplate,
	RoutineFolder,
} from "@hevy-mcp/hevy-client/types";
import { HevyHttpError, type HevyClient } from "@hevy-mcp/hevy-client";
import { projectRoutineFolder } from "../utils/response-contracts.js";
import {
	createExerciseTemplateCatalog,
	type ExerciseTemplateCatalog,
} from "../utils/exercise-template-catalog.js";
import { createToolRuntime, type ToolRuntime } from "../tools/tool-runtime.js";
import { registerToolDefinition } from "../tools/define-tool.js";
import { templateToolDefinitions } from "../tools/templates.js";
import { registerHevyResources } from "./hevy.js";

function createTestRuntime(
	client: HevyClient | null,
	catalog?: ExerciseTemplateCatalog,
) {
	return createToolRuntime({
		client,
		catalog:
			catalog ??
			(client
				? createExerciseTemplateCatalog(client)
				: ({} as ExerciseTemplateCatalog)),
	});
}

function registerTemplateDefinitions(server: McpServer, runtime: ToolRuntime) {
	for (const definition of templateToolDefinitions) {
		registerToolDefinition(server, runtime, definition);
	}
}

function createMockServer() {
	const registerResource = vi.fn();
	const tool = vi.fn();
	const server = {
		registerResource,
		tool,
		registerTool: tool,
	} as unknown as McpServer;
	return { registerResource, server, tool };
}

function createTestContext(id: number) {
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
			ctx: unknown,
		) => Promise<ReadResourceResult>,
	};
}

function getToolHandler(tool: ReturnType<typeof vi.fn>, name: string) {
	const match = tool.mock.calls.find(([toolName]) => toolName === name);
	if (!match) {
		throw new Error(`Tool ${name} was not registered`);
	}

	return match.at(-1) as (args: object) => Promise<{
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
		const hevyClient = {
			getUserInfo: vi.fn().mockResolvedValue({
				data: {
					id: "user-1",
					name: "Test User",
					url: "https://hevy.com/user/test",
				},
			}),
			getWorkoutCount: vi.fn().mockResolvedValue({ workout_count: 42 }),
		} as unknown as HevyClient;
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
		const hevyClient = {
			getRoutineFolders: vi
				.fn()
				.mockResolvedValueOnce({
					page: 1,
					page_count: 2,
					routine_folders: [firstFolder],
				})
				.mockResolvedValueOnce({
					page: 2,
					page_count: 2,
					routine_folders: [secondFolder],
				}),
		} as unknown as HevyClient;
		registerHevyResources(server, createTestRuntime(hevyClient));

		const registration = getResourceRegistration(
			registerResource,
			"routine-folders",
		);
		const result = await registration.handler(
			new URL(registration.uri),
			createTestContext(3),
		);

		expect(vi.mocked(hevyClient.getRoutineFolders)).toHaveBeenNthCalledWith(
			1,
			{ page: 1, pageSize: 10 },
			expect.objectContaining({
				signal: expect.any(AbortSignal),
				deadline: expect.any(Number),
			}),
		);
		expect(vi.mocked(hevyClient.getRoutineFolders)).toHaveBeenNthCalledWith(
			2,
			{ page: 2, pageSize: 10 },
			expect.objectContaining({
				signal: expect.any(AbortSignal),
				deadline: expect.any(Number),
			}),
		);
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
		const getRoutineFolders = vi.fn().mockResolvedValue({
			page: 1,
			page_count: 0,
			routine_folders: [folder],
		});
		registerHevyResources(
			server,
			createTestRuntime({ getRoutineFolders } as unknown as HevyClient),
		);
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
		const getRoutineFolders = vi.fn().mockResolvedValue(undefined);
		registerHevyResources(
			server,
			createTestRuntime({ getRoutineFolders } as unknown as HevyClient),
		);
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

	it("shares completed catalog values while isolating controlled in-flight calls", async () => {
		const { registerResource, server, tool } = createMockServer();
		let resolveCatalog!: (value: {
			page: number;
			page_count: number;
			exercise_templates: ExerciseTemplate[];
		}) => void;
		const pendingCatalog = new Promise<{
			page: number;
			page_count: number;
			exercise_templates: ExerciseTemplate[];
		}>((resolve) => {
			resolveCatalog = resolve;
		});
		const hevyClient = {
			getExerciseTemplates: vi.fn().mockReturnValue(pendingCatalog),
		} as unknown as HevyClient;
		const catalog = createExerciseTemplateCatalog(hevyClient);
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

		expect(vi.mocked(hevyClient.getExerciseTemplates)).toHaveBeenCalledTimes(2);
		resolveCatalog({
			page: 1,
			page_count: 1,
			exercise_templates: [benchTemplate],
		});

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
		registerHevyResources(
			failedServer.server,
			createTestRuntime({
				getWorkoutCount: vi.fn().mockRejectedValue(apiFailure),
			} as unknown as HevyClient),
		);
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
				status: 503,
				outcome: "terminal_failure",
				phase: "response-content",
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
