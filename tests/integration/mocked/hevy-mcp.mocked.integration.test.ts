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
import nock from "nock";
import { registerHevyResources } from "../../../src/resources/hevy.js";
import { registerBodyMeasurementTools } from "../../../src/tools/body-measurements.js";
import { registerFolderTools } from "../../../src/tools/folders.js";
import { registerRoutineTools } from "../../../src/tools/routines.js";
import { registerTemplateTools } from "../../../src/tools/templates.js";
import { registerUserTools } from "../../../src/tools/user.js";
import { registerWorkoutTools } from "../../../src/tools/workouts.js";
import {
	createBodyMeasurementsResponse,
	createExerciseTemplateFixture,
	createExerciseTemplatesResponse,
	createRoutineFolderFixture,
	createRoutineFoldersResponse,
	createUserInfoFixture,
	createUserInfoResponse,
	createWorkoutCountResponse,
	createWorkoutsResponse,
} from "../../support/hevy-fixtures.js";
import {
	callTool as callMockedTool,
	composeMockedComponentRegistration,
	createMockedApiScope,
	createMockedMcpHarness,
	disableMockedMcpExternalNetworking,
	type MockedMcpHarness,
	parseToolText,
	teardownMockedMcpTestState,
} from "../../support/mocked-mcp.js";

async function callTool(
	client: MockedMcpHarness["client"],
	name: string,
	arguments_: Record<string, unknown>,
) {
	return callMockedTool(client, name, arguments_, {
		requireStructuredContentForReadTools: true,
	});
}

const registerMockedComponents = composeMockedComponentRegistration(
	registerWorkoutTools,
	registerRoutineTools,
	registerTemplateTools,
	registerFolderTools,
	registerUserTools,
	registerBodyMeasurementTools,
	registerHevyResources,
);

describe("Hevy MCP Server Mocked Integration Tests", () => {
	let harness: MockedMcpHarness | null = null;
	let restoreExternalNetworking: (() => void) | undefined;

	beforeAll(() => {
		restoreExternalNetworking = disableMockedMcpExternalNetworking(() =>
			nock.enableNetConnect(),
		);
	});

	beforeEach(async () => {
		harness = await createMockedMcpHarness({
			name: "hevy-mcp-mocked-test",
			register: registerMockedComponents,
		});
	});

	afterEach(async () => {
		const harnessToClose = harness;
		harness = null;
		await teardownMockedMcpTestState(harnessToClose);
	});

	afterAll(() => {
		restoreExternalNetworking?.();
	});

	it("advertises output schemas for all read-only tools", async () => {
		if (!harness) throw new Error("Harness not initialized");
		const result = await harness.client.listTools();
		const readOnlyNames = new Set([
			"get-workouts",
			"get-workout",
			"get-workout-count",
			"get-workout-events",
			"get-routines",
			"get-routine",
			"get-exercise-templates",
			"get-exercise-template",
			"get-exercise-history",
			"search-exercise-templates",
			"get-routine-folders",
			"get-routine-folder",
			"get-body-measurements",
			"get-body-measurement",
			"get-user-info",
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
		if (!harness) throw new Error("Harness not initialized");

		createMockedApiScope()
			.get("/v1/workouts")
			.query({ page: 1, pageSize: 1 })
			.reply(200, createWorkoutsResponse());

		const result = await callTool(harness.client, "get-workouts", {
			page: 1,
			pageSize: 1,
		});
		const payload = parseToolText<
			Array<{
				id: string;
				title: string;
				duration: string;
			}>
		>(result);

		expect(result.isError).toBeFalsy();
		expect(payload[0]).toMatchObject({
			id: "workout-1",
			title: "Mock Workout",
			duration: "1h 0m 0s",
		});
	});

	it("accepts nullable workout fields through MCP output validation", async () => {
		if (!harness) throw new Error("Harness not initialized");

		createMockedApiScope()
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

		const result = await callTool(harness.client, "get-workout", {
			workoutId: "workout-null-fields",
		});
		const structuredContent = result.structuredContent as {
			workout: {
				description: null;
				exercises: Array<{ notes: null }>;
			};
		};

		expect(result.isError).toBeFalsy();
		expect(structuredContent).toMatchObject({
			workout: {
				description: null,
				exercises: [{ notes: null }],
			},
		});
		expect(result.text).toBe(
			JSON.stringify(structuredContent.workout, null, 2),
		);
	});

	it("mocks get-routines through MCP client/server transport", async () => {
		if (!harness) throw new Error("Harness not initialized");

		createMockedApiScope()
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

		const result = await callTool(harness.client, "get-routines", {
			page: 1,
			pageSize: 1,
		});
		const structuredContent = result.structuredContent as {
			routines: Array<{
				id: string;
				title: string;
				folderId: number;
				exercises: Array<{ restSeconds: number }>;
			}>;
		};
		const payload = parseToolText<
			Array<{
				id: string;
				title: string;
				folderId: number;
				exercises: Array<{ restSeconds: number }>;
			}>
		>(result);

		expect(result.isError).toBeFalsy();
		expect(structuredContent.routines[0]).toMatchObject({
			id: "routine-1",
			title: "Mock Push Day",
			folderId: 10,
			exercises: [{ restSeconds: 60 }],
		});
		expect(structuredContent.routines[0]?.exercises[0]?.restSeconds).toBe(60);
		expect(payload).toEqual(structuredContent.routines);
	});

	it("accepts nullable routine exercise notes through MCP output validation", async () => {
		if (!harness) throw new Error("Harness not initialized");

		createMockedApiScope()
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

		const result = await callTool(harness.client, "get-routine", {
			routineId: "routine-null-notes",
		});
		const structuredContent = result.structuredContent as {
			routine: {
				exercises: Array<{ notes: null }>;
			};
		};

		expect(result.isError).toBeFalsy();
		expect(structuredContent).toMatchObject({
			routine: {
				exercises: [{ notes: null }],
			},
		});
		expect(result.text).toBe(
			JSON.stringify(structuredContent.routine, null, 2),
		);
	});

	it("mocks get-exercise-templates through MCP transport", async () => {
		if (!harness) throw new Error("Harness not initialized");

		createMockedApiScope()
			.get("/v1/exercise_templates")
			.query({ page: 1, pageSize: 1 })
			.reply(200, createExerciseTemplatesResponse());

		const result = await callTool(harness.client, "get-exercise-templates", {
			page: 1,
			pageSize: 1,
		});
		const payload = parseToolText<
			Array<{
				id: string;
				title: string;
				primaryMuscleGroup: string;
			}>
		>(result);

		expect(result.isError).toBeFalsy();
		expect(payload[0]).toMatchObject({
			id: "template-1",
			title: "Bench Press",
			primaryMuscleGroup: "chest",
		});
	});

	it("mocks get-routine-folders through MCP transport", async () => {
		if (!harness) throw new Error("Harness not initialized");

		createMockedApiScope()
			.get("/v1/routine_folders")
			.query({ page: 1, pageSize: 1 })
			.reply(200, createRoutineFoldersResponse());

		const result = await callTool(harness.client, "get-routine-folders", {
			page: 1,
			pageSize: 1,
		});
		const payload = parseToolText<
			Array<{
				id: number;
				title: string;
			}>
		>(result);

		expect(result.isError).toBeFalsy();
		expect(payload[0]).toMatchObject({
			id: 10,
			title: "Mock Folder",
		});
	});

	it("mocks get-body-measurements through MCP transport", async () => {
		if (!harness) throw new Error("Harness not initialized");

		createMockedApiScope()
			.get("/v1/body_measurements")
			.query({ page: 1, pageSize: 1 })
			.reply(200, createBodyMeasurementsResponse());

		const result = await callTool(harness.client, "get-body-measurements", {
			page: 1,
			pageSize: 1,
		});
		const payload = parseToolText<
			Array<{
				date: string;
				weightKg: number;
				fatPercent: number;
			}>
		>(result);

		expect(result.isError).toBeFalsy();
		expect(payload[0]).toMatchObject({
			date: "2025-03-25",
			weightKg: 80.5,
			fatPercent: 19.3,
		});
	});

	it("mocks get-user-info through MCP transport", async () => {
		if (!harness) throw new Error("Harness not initialized");

		createMockedApiScope()
			.get("/v1/user/info")
			.reply(200, createUserInfoResponse());

		const result = await callTool(harness.client, "get-user-info", {});
		const payload = parseToolText<{
			id: string;
			name: string;
			url: string;
		}>(result);

		expect(result.isError).toBeFalsy();
		expect(payload).toMatchObject({
			id: "user-1",
			name: "Mock User",
			url: "https://hevy.com/user/mock-user",
		});
	});

	it("lists all Hevy resources through MCP transport", async () => {
		if (!harness) throw new Error("Harness not initialized");

		const result = await harness.client.listResources();
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
		if (!harness) throw new Error("Harness not initialized");

		createMockedApiScope()
			.get("/v1/user/info")
			.reply(
				200,
				createUserInfoResponse(
					createUserInfoFixture({
						id: "resource-user-1",
						name: "Resource User",
						url: "https://hevy.com/user/resource-user",
					}),
				),
			);
		createMockedApiScope()
			.get("/v1/exercise_templates")
			.query({ page: 1, pageSize: 100 })
			.reply(
				200,
				createExerciseTemplatesResponse([
					createExerciseTemplateFixture({
						id: "resource-template-1",
						title: "Resource Bench Press",
					}),
				]),
			);
		createMockedApiScope()
			.get("/v1/workouts/count")
			.reply(200, createWorkoutCountResponse());
		createMockedApiScope()
			.get("/v1/routine_folders")
			.query({ page: 1, pageSize: 10 })
			.reply(
				200,
				createRoutineFoldersResponse([
					createRoutineFolderFixture({
						id: 12,
						title: "Resource Folder",
						created_at: "2025-03-30T09:00:00Z",
						updated_at: "2025-03-30T10:00:00Z",
					}),
				]),
			);

		const userResult = await harness.client.readResource({
			uri: "hevy://user",
		});
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

		const templatesResult = await harness.client.readResource({
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
				primaryMuscleGroup: "chest",
				secondaryMuscleGroups: ["triceps"],
				isCustom: false,
			},
		]);

		const countResult = await harness.client.readResource({
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
		expect(JSON.parse(countContent.text)).toEqual({ count: 42 });

		const foldersResult = await harness.client.readResource({
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
				createdAt: "2025-03-30T09:00:00Z",
				updatedAt: "2025-03-30T10:00:00Z",
			},
		]);
	});

	it("mocks a write tool through MCP transport", async () => {
		if (!harness) throw new Error("Harness not initialized");

		createMockedApiScope()
			.post("/v1/routine_folders", {
				routine_folder: {
					title: "Created Folder",
				},
			})
			.reply(
				201,
				createRoutineFolderFixture({
					id: 99,
					title: "Created Folder",
					created_at: "2025-03-29T10:00:00Z",
					updated_at: "2025-03-29T10:00:00Z",
				}),
			);

		const result = await callTool(harness.client, "create-routine-folder", {
			name: "Created Folder",
		});
		const payload = parseToolText<{
			id: number;
			title: string;
		}>(result);

		expect(result.isError).toBeFalsy();
		expect(payload).toMatchObject({
			id: 99,
			title: "Created Folder",
		});
	});

	it("returns MCP error output when Hevy API returns 404", async () => {
		if (!harness) throw new Error("Harness not initialized");
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		try {
			createMockedApiScope().get("/v1/workouts/missing-workout").reply(404, {
				error: "workout not found",
			});

			const result = await callTool(harness.client, "get-workout", {
				workoutId: "missing-workout",
			});

			expect(result.isError).toBe(true);
			expect(result.text).toContain("[get-workout] Error");
			expect(result.text.toLowerCase()).toContain("not found");
		} finally {
			consoleErrorSpy.mockRestore();
		}
	});
});
