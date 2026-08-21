import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import {
	Client,
	type JSONObject,
	type JSONValue,
} from "@modelcontextprotocol/client";
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
import { registerHevyResources } from "../../../packages/core/src/resources/hevy.js";
import { registerHevyTools } from "../../../packages/core/src/tools/register.js";
import { createToolRuntime } from "../../../packages/core/src/tools/tool-runtime.js";
import { createExerciseTemplateCatalog } from "../../../packages/core/src/utils/exercise-template-catalog.js";
import { createHevyClient } from "../../../packages/hevy-client/src/hevy-client.js";
import { z } from "zod";

const stringSchema = z.string();

function isString(value: JSONValue | undefined): value is string {
	return stringSchema.safeParse(value).success;
}

const HEVY_API_BASEURL = "https://api.hevyapp.com";
const MOCK_HEVY_API_KEY = "mock-hevy-api-key";

function getApiScope() {
	return nock(HEVY_API_BASEURL, {
		reqheaders: {
			"api-key": MOCK_HEVY_API_KEY,
		},
	});
}

async function callTool(client: Client, name: string, arguments_: JSONObject) {
	const result = await client.request({
		method: "tools/call",
		params: {
			name,
			arguments: arguments_,
		},
	});

	const firstContent = result.content[0];
	if (!firstContent || firstContent.type !== "text") {
		throw new Error("Expected text content in MCP tool response");
	}
	if (
		!result.isError &&
		(name.startsWith("get-") || name.startsWith("search-")) &&
		result.structuredContent === undefined
	) {
		throw new Error(`Expected structured content from ${name}`);
	}

	return {
		isError: result.isError,
		text: firstContent.text,
		structuredContent: result.structuredContent,
	};
}

describe("Hevy MCP Server Mocked Integration Tests", () => {
	let server: McpServer | null = null;
	let client: Client | null = null;

	beforeAll(() => {
		nock.disableNetConnect();
	});

	beforeEach(async () => {
		server = new McpServer({
			name: "hevy-mcp-mocked-test",
			version: "1.0.0",
		});

		const hevyClient = createHevyClient({
			apiKey: MOCK_HEVY_API_KEY,
			baseUrl: HEVY_API_BASEURL,
		});
		const runtime = createToolRuntime({
			client: hevyClient,
			catalog: createExerciseTemplateCatalog(hevyClient),
		});

		registerHevyTools(server, runtime);
		registerHevyResources(server, runtime);

		client = new Client({
			name: "hevy-mcp-mocked-test-client",
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

	it("advertises output schemas for all read-only tools", async () => {
		if (!client) throw new Error("Client not initialized");
		const result = await client.listTools();
		const readOnlyNames = new Set([
			"get-workouts",
			"get-workout",

			"get-workout-events",
			"get-routines",
			"get-routine",

			"get-exercise-template",
			"get-exercise-history",
			"search-exercise-templates",

			"get-routine-folder",
			"get-body-measurements",
			"get-body-measurement",

			"get-training-summary",
			"search-routines",
		]);
		const readOnlyTools = result.tools.filter(({ name }) =>
			readOnlyNames.has(name),
		);

		expect(readOnlyTools).toHaveLength(readOnlyNames.size);
		for (const tool of readOnlyTools) {
			expect(tool.outputSchema, `${tool.name} output schema`).toBeTruthy();
		}
	});

	it("mocks get-workouts through MCP client/server transport", async () => {
		if (!client) throw new Error("Client not initialized");

		getApiScope()
			.get("/v1/workouts")
			.query({ page: 1, pageSize: 1 })
			.reply(200, {
				page: 1,
				page_count: 1,
				workouts: [
					{
						id: "workout-1",
						title: "Mock Workout",
						description: "Upper body session",
						start_time: "2025-03-27T07:00:00Z",
						end_time: "2025-03-27T08:00:00Z",
						created_at: "2025-03-27T07:00:00Z",
						updated_at: "2025-03-27T08:00:00Z",
						exercises: [],
					},
				],
			});

		const result = await callTool(client, "get-workouts", {
			page: 1,
			page_size: 1,
		});
		const structuredContent = result.structuredContent as {
			workouts: Array<{
				id: string;
				title: string;
				duration: string;
				exercise_count: number;
				set_count: number;
			}>;
		};
		const payload = JSON.parse(result.text) as Array<{
			id: string;
			title: string;
			exercise_count: number;
			set_count: number;
			duration: string;
		}>;

		expect(result.isError).toBeFalsy();
		expect(structuredContent.workouts[0]).toMatchObject({
			id: "workout-1",
			title: "Mock Workout",
			duration: "1h 0m 0s",
			exercise_count: 0,
			set_count: 0,
		});
		expect(isString(structuredContent.workouts[0]?.id)).toBe(true);
		expect(structuredContent.workouts[0]).not.toHaveProperty("exercises");
		expect(payload).toEqual(structuredContent.workouts);
	});

	it("accepts nullable workout fields through MCP output validation", async () => {
		if (!client) throw new Error("Client not initialized");

		getApiScope()
			.get("/v1/workouts/workout-null-fields")
			.reply(200, {
				id: "workout-null-fields",
				title: "Nullable Workout",
				description: null,
				start_time: "2025-03-27T07:00:00Z",
				end_time: "2025-03-27T08:00:00Z",
				exercises: [
					{
						index: 0,
						title: "Bench Press",
						exercise_template_id: "template-1",
						notes: null,
						sets: [],
					},
				],
			});

		const result = await callTool(client, "get-workout", {
			workout_id: "workout-null-fields",
		});
		const structuredContent = result.structuredContent as {
			workout: {
				exercises: Array<object>;
			};
		};

		expect(result.isError).toBeFalsy();
		expect(structuredContent.workout).not.toHaveProperty("description");
		expect(structuredContent.workout.exercises[0]).not.toHaveProperty("notes");
		expect(result.text).toBe(
			JSON.stringify(structuredContent.workout, null, 2),
		);
	});

	it("patches workout metadata after fetching the existing workout", async () => {
		if (!client) throw new Error("Client not initialized");

		const requestMethods: string[] = [];
		const scope = getApiScope();
		scope.on("request", (request) => {
			requestMethods.push(request.method);
		});
		scope.get("/v1/workouts/w1").reply(200, {
			id: "w1",
			title: "Original",
			description: "Keep this",
			start_time: "2025-03-27T07:00:00Z",
			end_time: "2025-03-27T08:00:00Z",
			exercises: [
				{
					index: 0,
					title: "Bench Press",
					exercise_template_id: "bench",
					supersets_id: 9,
					notes: null,
					sets: [
						{
							index: 0,
							type: "normal",
							weight_kg: 50,
							reps: 8,
							distance_meters: null,
							duration_seconds: null,
							rpe: null,
							custom_metric: null,
						},
					],
				},
			],
		});
		scope
			.put("/v1/workouts/w1", {
				workout: {
					title: "Renamed",
					description: null,
					start_time: "2025-03-27T07:00:00Z",
					end_time: "2025-03-27T08:00:00Z",
					is_private: false,
					exercises: [
						{
							exercise_template_id: "bench",
							superset_id: 9,
							notes: null,
							sets: [
								{
									type: "normal",
									weight_kg: 50,
									reps: 8,
									distance_meters: null,
									duration_seconds: null,
									rpe: null,
									custom_metric: null,
								},
							],
						},
					],
				},
			})
			.reply(200, {
				id: "w1",
				title: "Renamed",
				description: null,
				start_time: "2025-03-27T07:00:00Z",
				end_time: "2025-03-27T08:00:00Z",
				exercises: [
					{
						index: 0,
						title: "Bench Press",
						exercise_template_id: "bench",
						supersets_id: 9,
						notes: null,
						sets: [
							{
								index: 0,
								type: "normal",
								weight_kg: 50,
								reps: 8,
								distance_meters: null,
								duration_seconds: null,
								rpe: null,
								custom_metric: null,
							},
						],
					},
				],
			});

		const result = await callTool(client, "update-workout", {
			workout_id: "w1",
			workout: { title: "Renamed", description: null, is_private: false },
		});
		expect(requestMethods).toEqual(["GET", "PUT"]);
		const payload: unknown = JSON.parse(result.text);

		expect(result.isError).toBeFalsy();
		expect(result.structuredContent).toBeUndefined();
		expect(payload).toEqual({
			id: "w1",
			title: "Renamed",
			start_time: "2025-03-27T07:00:00Z",
			end_time: "2025-03-27T08:00:00Z",
			duration: "1h 0m 0s",
			exercises: [
				{
					index: 0,
					title: "Bench Press",
					exercise_template_id: "bench",
					supersets_id: 9,
					sets: [
						{
							index: 0,
							type: "normal",
							weight_kg: 50,
							reps: 8,
						},
					],
				},
			],
		});
	});

	it("mocks get-routines through MCP client/server transport", async () => {
		if (!client) throw new Error("Client not initialized");

		getApiScope()
			.get("/v1/routines")
			.query({ page: 1, pageSize: 1 })
			.reply(200, {
				page: 1,
				page_count: 1,
				routines: [
					{
						id: "routine-1",
						title: "Mock Push Day",
						folder_id: 10,
						created_at: "2025-03-26T19:00:00Z",
						updated_at: "2025-03-26T19:15:00Z",
						exercises: [
							{
								index: 0,
								title: "Bench Press",
								exercise_template_id: "template-1",
								rest_seconds: 60,
								sets: [],
							},
						],
					},
				],
			});

		const result = await callTool(client, "get-routines", {
			page: 1,
			page_size: 1,
		});
		const structuredContent = result.structuredContent as {
			routines: Array<{
				id: string;
				title: string;
				folder_id: number;
				exercise_count: number;
				set_count: number;
			}>;
		};
		const payload = JSON.parse(result.text) as Array<{
			id: string;
			title: string;
			folder_id: number;
			exercise_count: number;
			set_count: number;
		}>;

		expect(result.isError).toBeFalsy();
		expect(structuredContent.routines[0]).toMatchObject({
			id: "routine-1",
			title: "Mock Push Day",
			folder_id: 10,
			exercise_count: 1,
			set_count: 0,
		});
		expect(isString(structuredContent.routines[0]?.id)).toBe(true);
		expect(structuredContent.routines[0]).not.toHaveProperty("exercises");
		expect(payload).toEqual(structuredContent.routines);
	});

	it("accepts nullable routine exercise notes through MCP output validation", async () => {
		if (!client) throw new Error("Client not initialized");

		getApiScope()
			.get("/v1/routines/routine-null-notes")
			.reply(200, {
				routine: {
					id: "routine-null-notes",
					title: "Nullable Routine",
					folder_id: null,
					exercises: [
						{
							index: 0,
							title: "Bench Press",
							exercise_template_id: "template-1",
							notes: null,
							sets: [],
						},
					],
				},
			});

		const result = await callTool(client, "get-routine", {
			routine_id: "routine-null-notes",
		});
		const structuredContent = result.structuredContent as {
			routine: {
				folder_id?: number;
				exercises: Array<object>;
			};
		};

		expect(result.isError).toBeFalsy();
		expect(structuredContent.routine).not.toHaveProperty("folder_id");
		expect(structuredContent.routine.exercises[0]).not.toHaveProperty("notes");
		expect(result.text).toBe(
			JSON.stringify(structuredContent.routine, null, 2),
		);
	});

	it("mocks get-body-measurements through MCP transport", async () => {
		if (!client) throw new Error("Client not initialized");

		getApiScope()
			.get("/v1/body_measurements")
			.query({ page: 1, pageSize: 1 })
			.reply(200, {
				page: 1,
				page_count: 1,
				body_measurements: [
					{
						date: "2025-03-25",
						weight_kg: 80.5,
						fat_percent: 19.3,
					},
				],
			});

		const result = await callTool(client, "get-body-measurements", {
			page: 1,
			page_size: 1,
		});
		const payload = JSON.parse(result.text) as Array<{
			weight_kg: number;
			fat_percent: number;
		}>;

		expect(result.isError).toBeFalsy();
		expect(payload[0]).toMatchObject({
			weight_kg: 80.5,
			fat_percent: 19.3,
		});
	});

	it("lists all Hevy resources through MCP transport", async () => {
		if (!client) throw new Error("Client not initialized");

		const result = await client.listResources();
		expect(
			result.resources.map(({ name, uri, mimeType }) => ({
				name,
				uri,
				mimeType,
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

	it("reads all Hevy resources through MCP transport", async () => {
		if (!client) throw new Error("Client not initialized");

		getApiScope()
			.get("/v1/user/info")
			.reply(200, {
				data: {
					id: "resource-user-1",
					name: "Resource User",
					url: "https://hevy.com/user/resource-user",
				},
			});
		getApiScope()
			.get("/v1/exercise_templates")
			.query({ page: 1, pageSize: 100 })
			.reply(200, {
				page: 1,
				page_count: 1,
				exercise_templates: [
					{
						id: "resource-template-1",
						title: "Resource Bench Press",
						type: "weight_reps",
						primary_muscle_group: "chest",
						secondary_muscle_groups: ["triceps"],
						is_custom: false,
					},
				],
			});
		getApiScope().get("/v1/workouts/count").reply(200, {
			workout_count: 42,
		});
		getApiScope()
			.get("/v1/routine_folders")
			.query({ page: 1, pageSize: 10 })
			.reply(200, {
				page: 1,
				page_count: 1,
				routine_folders: [
					{
						id: 12,
						title: "Resource Folder",
						created_at: "2025-03-30T09:00:00Z",
						updated_at: "2025-03-30T10:00:00Z",
					},
				],
			});

		const userResult = await client.readResource({ uri: "hevy://user" });
		const userContent = userResult.contents[0];
		if (!userContent || !("text" in userContent)) {
			throw new Error("Expected user JSON text resource");
		}
		expect(userContent).toMatchObject({
			uri: "hevy://user",
			mimeType: "application/json",
		});
		expect(JSON.parse(userContent.text)).toEqual({
			id: "resource-user-1",
			name: "Resource User",
			url: "https://hevy.com/user/resource-user",
		});

		const templatesResult = await client.readResource({
			uri: "hevy://exercise-templates",
		});
		const templatesContent = templatesResult.contents[0];
		if (!templatesContent || !("text" in templatesContent)) {
			throw new Error("Expected templates JSON text resource");
		}
		expect(templatesContent).toMatchObject({
			uri: "hevy://exercise-templates",
			mimeType: "application/json",
		});
		expect(JSON.parse(templatesContent.text)).toEqual([
			{
				id: "resource-template-1",
				title: "Resource Bench Press",
				type: "weight_reps",
				primary_muscle_group: "chest",
				secondary_muscle_groups: ["triceps"],
				is_custom: false,
			},
		]);

		const countResult = await client.readResource({
			uri: "hevy://workout-count",
		});
		const countContent = countResult.contents[0];
		if (!countContent || !("text" in countContent)) {
			throw new Error("Expected workout count JSON text resource");
		}
		expect(countContent).toMatchObject({
			uri: "hevy://workout-count",
			mimeType: "application/json",
		});
		expect(JSON.parse(countContent.text)).toEqual({ workout_count: 42 });

		const foldersResult = await client.readResource({
			uri: "hevy://routine-folders",
		});
		const foldersContent = foldersResult.contents[0];
		if (!foldersContent || !("text" in foldersContent)) {
			throw new Error("Expected routine folders JSON text resource");
		}
		expect(foldersContent).toMatchObject({
			uri: "hevy://routine-folders",
			mimeType: "application/json",
		});
		expect(JSON.parse(foldersContent.text)).toEqual([
			{
				id: 12,
				title: "Resource Folder",
				created_at: "2025-03-30T09:00:00Z",
				updated_at: "2025-03-30T10:00:00Z",
			},
		]);
	});

	it("mocks a write tool through MCP transport", async () => {
		if (!client) throw new Error("Client not initialized");

		getApiScope()
			.post("/v1/routine_folders", {
				routine_folder: {
					title: "Created Folder",
				},
			})
			.reply(201, {
				id: 99,
				title: "Created Folder",
				created_at: "2025-03-29T10:00:00Z",
				updated_at: "2025-03-29T10:00:00Z",
			});

		const result = await callTool(client, "create-routine-folder", {
			routine_folder: {
				title: "Created Folder",
			},
		});
		const payload = JSON.parse(result.text) as {
			id: number;
			title: string;
		};

		expect(result.isError).toBeFalsy();
		expect(payload).toMatchObject({
			id: 99,
			title: "Created Folder",
		});
	});

	it("returns structured not-found output when Hevy API returns 404", async () => {
		if (!client) throw new Error("Client not initialized");
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		try {
			getApiScope().get("/v1/workouts/missing-workout").reply(404, {
				error: "workout not found",
			});

			const result = await callTool(client, "get-workout", {
				workout_id: "missing-workout",
			});

			expect(result.isError).toBeFalsy();
			expect(result.structuredContent).toEqual({ workout: null });
			expect(result.text).toContain(
				"Workout with ID missing-workout not found",
			);
		} finally {
			consoleErrorSpy.mockRestore();
		}
	});
});
