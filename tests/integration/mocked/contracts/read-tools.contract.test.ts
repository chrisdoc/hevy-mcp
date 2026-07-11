import nock, { type Scope } from "nock";
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
import { z, type ZodTypeAny } from "zod";
import { registerHevyMcp } from "../../../../src/mcp-registration.js";
import {
	bodyMeasurementOutputSchema,
	bodyMeasurementsOutputSchema,
	exerciseHistoryOutputSchema,
	exerciseTemplateOutputSchema,
	exerciseTemplatesOutputSchema,
	routineFolderOutputSchema,
	routineFoldersOutputSchema,
	routineOutputSchema,
	routinesOutputSchema,
	userOutputSchema,
	workoutCountOutputSchema,
	workoutEventsOutputSchema,
	workoutOutputSchema,
	workoutsOutputSchema,
} from "../../../../src/utils/output-schemas.js";
import {
	createBodyMeasurementFixture,
	createBodyMeasurementsResponse,
	createExerciseTemplateFixture,
	createExerciseTemplatesResponse,
	createRoutineFixture,
	createRoutineFolderFixture,
	createRoutineFoldersResponse,
	createRoutinesResponse,
	createUserInfoResponse,
	createWorkoutCountResponse,
	createWorkoutFixture,
	createWorkoutsResponse,
} from "../../../support/hevy-fixtures.js";
import { MCP_TOOL_CONTRACTS } from "../../../support/mcp-contract-inventory.js";
import {
	callTool,
	createMockedApiScope,
	createMockedMcpHarness,
	disableMockedMcpExternalNetworking,
	parseToolText,
	teardownMockedMcpTestState,
	type MockedMcpHarness,
} from "../../../support/mocked-mcp.js";

type OutputSchema = Readonly<Record<string, ZodTypeAny>>;
type Query = Readonly<Record<string, string | number | boolean>>;

interface RouteContract {
	readonly path: string;
	readonly query?: Query;
}

interface ResponseContract {
	readonly body: unknown;
	readonly emptyText?: string;
	readonly expectedJsonText?: unknown;
	readonly expectedStructured: Record<string, unknown>;
}

interface UpstreamFailureContract {
	readonly attempts: 1 | 4;
	readonly expectedText: string;
	readonly networkError?: string;
	readonly responseBody?: string | Record<string, unknown>;
	readonly status?: number;
}

interface ReadToolContract {
	readonly name: string;
	readonly outputKey: string;
	readonly outputSchema: OutputSchema;
	readonly route: RouteContract;
	readonly success: ResponseContract;
	readonly empty: ResponseContract;
	readonly validArguments: Readonly<Record<string, unknown>>;
	readonly invalidArguments: Readonly<Record<string, unknown>> | null;
	readonly upstreamFailure: UpstreamFailureContract;
}

const workout = createWorkoutFixture({
	exercises: [
		{
			index: 0,
			title: "Bench Press",
			notes: "Pause on the chest",
			exercise_template_id: "template-1",
			supersets_id: 7,
			sets: [
				{
					index: 0,
					type: "normal",
					weight_kg: 100,
					reps: 5,
					distance_meters: null,
					duration_seconds: null,
					rpe: 8.5,
					custom_metric: null,
				},
			],
		},
	],
});
const expectedWorkout = {
	id: "workout-1",
	title: "Mock Workout",
	description: "Upper body session",
	startTime: "2025-03-27T07:00:00Z",
	endTime: "2025-03-27T08:00:00Z",
	createdAt: "2025-03-27T07:00:00Z",
	updatedAt: "2025-03-27T08:00:00Z",
	duration: "1h 0m 0s",
	exercises: [
		{
			index: 0,
			name: "Bench Press",
			exerciseTemplateId: "template-1",
			notes: "Pause on the chest",
			supersetsId: 7,
			sets: [
				{
					index: 0,
					type: "normal",
					weight: 100,
					reps: 5,
					distance: null,
					duration: null,
					rpe: 8.5,
					customMetric: null,
				},
			],
		},
	],
};
const routine = createRoutineFixture({
	exercises: [
		{
			index: 0,
			title: "Bench Press",
			rest_seconds: "120",
			notes: "Controlled eccentric",
			exercise_template_id: "template-1",
			supersets_id: null,
			sets: [
				{
					index: 0,
					type: "normal",
					weight_kg: 95,
					reps: null,
					rep_range: { start: 6, end: 8 },
					distance_meters: null,
					duration_seconds: null,
					rpe: 8,
					custom_metric: null,
				},
			],
		},
	],
});
const expectedRoutine = {
	id: "routine-1",
	title: "Mock Push Day",
	folderId: 10,
	createdAt: "2025-03-26T19:00:00Z",
	updatedAt: "2025-03-26T19:15:00Z",
	exercises: [
		{
			name: "Bench Press",
			index: 0,
			exerciseTemplateId: "template-1",
			notes: "Controlled eccentric",
			supersetId: null,
			restSeconds: "120",
			sets: [
				{
					index: 0,
					type: "normal",
					weight: 95,
					reps: null,
					repRange: { start: 6, end: 8 },
					distance: null,
					duration: null,
					rpe: 8,
					customMetric: null,
				},
			],
		},
	],
};
const exerciseTemplate = createExerciseTemplateFixture();
const expectedExerciseTemplate = {
	id: "template-1",
	title: "Bench Press",
	type: "weight_reps",
	primaryMuscleGroup: "chest",
	secondaryMuscleGroups: ["triceps"],
	isCustom: false,
};
const routineFolder = createRoutineFolderFixture();
const expectedRoutineFolder = {
	id: 10,
	title: "Mock Folder",
	createdAt: "2025-03-26T09:00:00Z",
	updatedAt: "2025-03-26T09:00:00Z",
};
const bodyMeasurement = createBodyMeasurementFixture({
	lean_mass_kg: null,
	neck_cm: 38.2,
	shoulder_cm: null,
	chest_cm: 102.4,
	left_bicep_cm: null,
	right_bicep_cm: 36.1,
	waist: 82.7,
});
const expectedBodyMeasurement = {
	date: "2025-03-25",
	weightKg: 80.5,
	leanMassKg: null,
	fatPercent: 19.3,
	neckCm: 38.2,
	shoulderCm: null,
	chestCm: 102.4,
	leftBicepCm: null,
	rightBicepCm: 36.1,
	leftForearmCm: null,
	rightForearmCm: null,
	abdomen: null,
	waist: 82.7,
	hips: null,
	leftThigh: null,
	rightThigh: null,
	leftCalf: null,
	rightCalf: null,
};
const expectedUser = {
	id: "user-1",
	name: "Mock User",
	url: "https://hevy.com/user/mock-user",
};
const defaultSince = "1970-01-01T00:00:00Z";
const historyStart = "2025-01-01T00:00:00Z";
const historyEnd = "2025-03-31T23:59:59Z";

const retryExhaustedText = (toolName: string) =>
	`[${toolName}] Error: Unable to complete the request after 4 attempts to the Hevy API due to transient failures. Please try again shortly.`;

const READ_TOOL_CONTRACTS: readonly ReadToolContract[] = [
	{
		name: "get-workouts",
		outputKey: "workouts",
		outputSchema: workoutsOutputSchema,
		route: {
			path: "/v1/workouts",
			query: { page: 2, pageSize: 10 },
		},
		validArguments: { page: "2", pageSize: "10" },
		invalidArguments: { page: 0 },
		success: {
			body: createWorkoutsResponse([workout], { page: 2 }),
			expectedStructured: { workouts: [expectedWorkout] },
			expectedJsonText: [expectedWorkout],
		},
		empty: {
			body: createWorkoutsResponse([], { page: 2 }),
			emptyText: "No workouts found for the specified parameters",
			expectedStructured: { workouts: [] },
		},
		upstreamFailure: {
			status: 400,
			responseBody: { error: "bad request" },
			attempts: 1,
			expectedText: '[get-workouts] Error: {"error":"bad request"}',
		},
	},
	{
		name: "get-workout",
		outputKey: "workout",
		outputSchema: workoutOutputSchema,
		route: { path: "/v1/workouts/workout-1" },
		validArguments: { workoutId: "workout-1" },
		invalidArguments: { workoutId: "" },
		success: {
			body: workout,
			expectedStructured: { workout: expectedWorkout },
			expectedJsonText: expectedWorkout,
		},
		empty: {
			body: null,
			emptyText: "Workout with ID workout-1 not found",
			expectedStructured: { workout: null },
		},
		upstreamFailure: {
			status: 401,
			responseBody: { error: "redacted" },
			attempts: 1,
			expectedText:
				"[get-workout] Error: The Hevy API key is invalid or has expired. Check HEVY_API_KEY.",
		},
	},
	{
		name: "get-workout-count",
		outputKey: "count",
		outputSchema: workoutCountOutputSchema,
		route: { path: "/v1/workouts/count" },
		validArguments: {},
		invalidArguments: null,
		success: {
			body: createWorkoutCountResponse(42),
			expectedStructured: { count: 42 },
			expectedJsonText: { count: 42 },
		},
		empty: {
			body: createWorkoutCountResponse(0),
			expectedStructured: { count: 0 },
			expectedJsonText: { count: 0 },
		},
		upstreamFailure: {
			status: 403,
			responseBody: { error: "redacted" },
			attempts: 1,
			expectedText:
				"[get-workout-count] Error: The Hevy API key is invalid or has expired. Check HEVY_API_KEY.",
		},
	},
	{
		name: "get-workout-events",
		outputKey: "events",
		outputSchema: workoutEventsOutputSchema,
		route: {
			path: "/v1/workouts/events",
			query: { page: 1, pageSize: 5, since: defaultSince },
		},
		validArguments: {},
		invalidArguments: { pageSize: 11 },
		success: {
			body: {
				page: 1,
				page_count: 1,
				events: [{ type: "updated", workout }],
			},
			expectedStructured: {
				events: [{ type: "updated", workout: expectedWorkout }],
			},
			expectedJsonText: [{ type: "updated", workout: expectedWorkout }],
		},
		empty: {
			body: { page: 1, page_count: 1, events: [] },
			emptyText: `No workout events found for the specified parameters since ${defaultSince}`,
			expectedStructured: { events: [] },
		},
		upstreamFailure: {
			status: 404,
			responseBody: { error: "redacted" },
			attempts: 1,
			expectedText:
				"[get-workout-events] Error: The requested resource was not found in Hevy.",
		},
	},
	{
		name: "get-routines",
		outputKey: "routines",
		outputSchema: routinesOutputSchema,
		route: { path: "/v1/routines", query: { page: 1, pageSize: 5 } },
		validArguments: {},
		invalidArguments: { pageSize: 11 },
		success: {
			body: createRoutinesResponse([routine]),
			expectedStructured: { routines: [expectedRoutine] },
			expectedJsonText: [expectedRoutine],
		},
		empty: {
			body: createRoutinesResponse([]),
			emptyText: "No routines found for the specified parameters",
			expectedStructured: { routines: [] },
		},
		upstreamFailure: {
			status: 429,
			responseBody: { error: "rate limited" },
			attempts: 4,
			expectedText: retryExhaustedText("get-routines"),
		},
	},
	{
		name: "get-routine",
		outputKey: "routine",
		outputSchema: routineOutputSchema,
		route: { path: "/v1/routines/routine-1" },
		validArguments: { routineId: "routine-1" },
		invalidArguments: { routineId: "" },
		success: {
			body: { routine },
			expectedStructured: { routine: expectedRoutine },
			expectedJsonText: expectedRoutine,
		},
		empty: {
			body: {},
			emptyText: "Routine with ID routine-1 not found",
			expectedStructured: { routine: null },
		},
		upstreamFailure: {
			status: 408,
			responseBody: { error: "request timeout" },
			attempts: 4,
			expectedText: retryExhaustedText("get-routine"),
		},
	},
	{
		name: "get-exercise-templates",
		outputKey: "exerciseTemplates",
		outputSchema: exerciseTemplatesOutputSchema,
		route: {
			path: "/v1/exercise_templates",
			query: { page: 3, pageSize: 100 },
		},
		validArguments: { page: "3", pageSize: "100" },
		invalidArguments: { pageSize: 101 },
		success: {
			body: createExerciseTemplatesResponse([exerciseTemplate], { page: 3 }),
			expectedStructured: {
				exerciseTemplates: [expectedExerciseTemplate],
			},
			expectedJsonText: [expectedExerciseTemplate],
		},
		empty: {
			body: createExerciseTemplatesResponse([], { page: 3 }),
			emptyText: "No exercise templates found for the specified parameters",
			expectedStructured: { exerciseTemplates: [] },
		},
		upstreamFailure: {
			status: 502,
			responseBody: { error: "gateway failure" },
			attempts: 4,
			expectedText: retryExhaustedText("get-exercise-templates"),
		},
	},
	{
		name: "get-exercise-template",
		outputKey: "exerciseTemplate",
		outputSchema: exerciseTemplateOutputSchema,
		route: { path: "/v1/exercise_templates/template-1" },
		validArguments: { exerciseTemplateId: "template-1" },
		invalidArguments: { exerciseTemplateId: "" },
		success: {
			body: exerciseTemplate,
			expectedStructured: { exerciseTemplate: expectedExerciseTemplate },
			expectedJsonText: expectedExerciseTemplate,
		},
		empty: {
			body: null,
			emptyText: "Exercise template with ID template-1 not found",
			expectedStructured: { exerciseTemplate: null },
		},
		upstreamFailure: {
			status: 503,
			responseBody: { error: "unavailable" },
			attempts: 4,
			expectedText: retryExhaustedText("get-exercise-template"),
		},
	},
	{
		name: "get-exercise-history",
		outputKey: "exerciseHistory",
		outputSchema: exerciseHistoryOutputSchema,
		route: {
			path: "/v1/exercise_history/template-1",
			query: { start_date: historyStart, end_date: historyEnd },
		},
		validArguments: {
			exerciseTemplateId: "template-1",
			startDate: historyStart,
			endDate: historyEnd,
		},
		invalidArguments: {
			exerciseTemplateId: "template-1",
			startDate: "2025-01-01",
		},
		success: {
			body: {
				exercise_history: [
					{
						workout_id: "workout-1",
						workout_title: "Mock Workout",
						workout_start_time: workout.start_time,
						workout_end_time: workout.end_time,
						exercise_template_id: "template-1",
						weight_kg: 100,
						reps: 5,
						set_type: "normal",
					},
				],
			},
			expectedStructured: {
				exerciseHistory: [
					{
						workoutId: "workout-1",
						workoutTitle: "Mock Workout",
						workoutStartTime: "2025-03-27T07:00:00Z",
						workoutEndTime: "2025-03-27T08:00:00Z",
						exerciseTemplateId: "template-1",
						weight: 100,
						reps: 5,
						setType: "normal",
					},
				],
			},
			expectedJsonText: [
				{
					workoutId: "workout-1",
					workoutTitle: "Mock Workout",
					workoutStartTime: "2025-03-27T07:00:00Z",
					workoutEndTime: "2025-03-27T08:00:00Z",
					exerciseTemplateId: "template-1",
					weight: 100,
					reps: 5,
					setType: "normal",
				},
			],
		},
		empty: {
			body: { exercise_history: [] },
			emptyText: "No exercise history found for template template-1",
			expectedStructured: { exerciseHistory: [] },
		},
		upstreamFailure: {
			networkError: "network failure",
			attempts: 4,
			expectedText: retryExhaustedText("get-exercise-history"),
		},
	},
	{
		name: "search-exercise-templates",
		outputKey: "exerciseTemplates",
		outputSchema: exerciseTemplatesOutputSchema,
		route: {
			path: "/v1/exercise_templates",
			query: { page: 1, pageSize: 100 },
		},
		validArguments: {
			query: "bench",
			primaryMuscleGroup: "chest",
			refresh: true,
		},
		invalidArguments: { query: "" },
		success: {
			body: createExerciseTemplatesResponse([exerciseTemplate]),
			expectedStructured: {
				exerciseTemplates: [expectedExerciseTemplate],
			},
			expectedJsonText: [expectedExerciseTemplate],
		},
		empty: {
			body: createExerciseTemplatesResponse([
				createExerciseTemplateFixture({ id: "template-2", title: "Squat" }),
			]),
			emptyText:
				'No exercise templates found matching "bench" with primary muscle group "chest"',
			expectedStructured: { exerciseTemplates: [] },
		},
		upstreamFailure: {
			status: 400,
			responseBody: { error: "catalog request rejected" },
			attempts: 1,
			expectedText:
				'[search-exercise-templates] Error: {"error":"catalog request rejected"}',
		},
	},
	{
		name: "get-routine-folders",
		outputKey: "routineFolders",
		outputSchema: routineFoldersOutputSchema,
		route: {
			path: "/v1/routine_folders",
			query: { page: 1, pageSize: 5 },
		},
		validArguments: {},
		invalidArguments: { page: -1 },
		success: {
			body: createRoutineFoldersResponse([routineFolder]),
			expectedStructured: { routineFolders: [expectedRoutineFolder] },
			expectedJsonText: [expectedRoutineFolder],
		},
		empty: {
			body: createRoutineFoldersResponse([]),
			emptyText: "No routine folders found for the specified parameters",
			expectedStructured: { routineFolders: [] },
		},
		upstreamFailure: {
			status: 401,
			responseBody: { error: "redacted" },
			attempts: 1,
			expectedText:
				"[get-routine-folders] Error: The Hevy API key is invalid or has expired. Check HEVY_API_KEY.",
		},
	},
	{
		name: "get-routine-folder",
		outputKey: "routineFolder",
		outputSchema: routineFolderOutputSchema,
		route: { path: "/v1/routine_folders/10" },
		validArguments: { folderId: "10" },
		invalidArguments: { folderId: "" },
		success: {
			body: routineFolder,
			expectedStructured: { routineFolder: expectedRoutineFolder },
			expectedJsonText: expectedRoutineFolder,
		},
		empty: {
			body: null,
			emptyText: "Routine folder with ID 10 not found",
			expectedStructured: { routineFolder: null },
		},
		upstreamFailure: {
			status: 403,
			responseBody: { error: "redacted" },
			attempts: 1,
			expectedText:
				"[get-routine-folder] Error: The Hevy API key is invalid or has expired. Check HEVY_API_KEY.",
		},
	},
	{
		name: "get-body-measurements",
		outputKey: "bodyMeasurements",
		outputSchema: bodyMeasurementsOutputSchema,
		route: {
			path: "/v1/body_measurements",
			query: { page: 1, pageSize: 10 },
		},
		validArguments: {},
		invalidArguments: { pageSize: 0 },
		success: {
			body: createBodyMeasurementsResponse([bodyMeasurement]),
			expectedStructured: {
				bodyMeasurements: [expectedBodyMeasurement],
			},
			expectedJsonText: [expectedBodyMeasurement],
		},
		empty: {
			body: createBodyMeasurementsResponse([]),
			emptyText: "No body measurements found for the specified parameters",
			expectedStructured: { bodyMeasurements: [] },
		},
		upstreamFailure: {
			status: 404,
			responseBody: { error: "redacted" },
			attempts: 1,
			expectedText:
				"[get-body-measurements] Error: The requested resource was not found in Hevy.",
		},
	},
	{
		name: "get-body-measurement",
		outputKey: "bodyMeasurement",
		outputSchema: bodyMeasurementOutputSchema,
		route: { path: "/v1/body_measurements/2025-03-25" },
		validArguments: { date: "2025-03-25" },
		invalidArguments: { date: "03/25/2025" },
		success: {
			body: bodyMeasurement,
			expectedStructured: { bodyMeasurement: expectedBodyMeasurement },
			expectedJsonText: expectedBodyMeasurement,
		},
		empty: {
			body: null,
			emptyText: "No body measurement found for date 2025-03-25",
			expectedStructured: { bodyMeasurement: null },
		},
		upstreamFailure: {
			status: 422,
			responseBody: { error: "redacted" },
			attempts: 1,
			expectedText:
				"[get-body-measurement] Error: The request failed Hevy validation. Check the field values and try again.",
		},
	},
	{
		name: "get-user-info",
		outputKey: "user",
		outputSchema: userOutputSchema,
		route: { path: "/v1/user/info" },
		validArguments: {},
		invalidArguments: null,
		success: {
			body: createUserInfoResponse(),
			expectedStructured: { user: expectedUser },
			expectedJsonText: expectedUser,
		},
		empty: {
			body: {},
			emptyText: "No user info found for the authenticated user",
			expectedStructured: { user: null },
		},
		upstreamFailure: {
			status: 504,
			responseBody: { error: "gateway timeout" },
			attempts: 4,
			expectedText: retryExhaustedText("get-user-info"),
		},
	},
];

function sorted(values: readonly string[]): string[] {
	return [...values].sort();
}

function addRouteQuery(scope: Scope, route: RouteContract) {
	const interceptor = scope.get(route.path);
	return route.query ? interceptor.query({ ...route.query }) : interceptor;
}

function mockResponse(
	contract: ReadToolContract,
	body: unknown,
): { requestCount: () => number } {
	let requests = 0;
	addRouteQuery(createMockedApiScope(), contract.route).reply(() => {
		requests++;
		return [200, body];
	});
	return { requestCount: () => requests };
}

function mockOptionalValidationProbe(contract: ReadToolContract): {
	requestCount: () => number;
} {
	let requests = 0;
	addRouteQuery(createMockedApiScope(), {
		path: contract.route.path,
		query: undefined,
	})
		.query(true)
		.optionally()
		.reply(() => {
			requests++;
			return [200, contract.success.body];
		});
	return { requestCount: () => requests };
}

function mockFailure(contract: ReadToolContract): {
	requestCount: () => number;
} {
	let requests = 0;
	if (contract.upstreamFailure.networkError) {
		for (
			let attempt = 0;
			attempt < contract.upstreamFailure.attempts;
			attempt++
		) {
			const scope = createMockedApiScope();
			scope.on("request", () => {
				requests++;
			});
			addRouteQuery(scope, contract.route).replyWithError(
				contract.upstreamFailure.networkError,
			);
		}

		return { requestCount: () => requests };
	}

	const scope = createMockedApiScope();
	scope.on("request", () => {
		requests++;
	});
	const interceptor = addRouteQuery(scope, contract.route).times(
		contract.upstreamFailure.attempts,
	);

	interceptor.reply(
		contract.upstreamFailure.status ?? 500,
		contract.upstreamFailure.responseBody,
	);

	return { requestCount: () => requests };
}

function parseStructuredContent(
	contract: ReadToolContract,
	structuredContent: Record<string, unknown> | undefined,
): Record<string, unknown> {
	expect(structuredContent, `${contract.name} structuredContent`).toBeDefined();
	return z.object(contract.outputSchema).parse(structuredContent);
}

function expectSuccessfulJsonParity(
	contract: ReadToolContract,
	response: ResponseContract,
	result: Awaited<ReturnType<typeof callTool>>,
): void {
	const structured = parseStructuredContent(contract, result.structuredContent);
	const parsedText = parseToolText<unknown>(result, contract.name);

	expect(result.isError, contract.name).toBeFalsy();
	expect(structured, `${contract.name} exact structuredContent`).toEqual(
		response.expectedStructured,
	);
	expect(parsedText, `${contract.name} JSON text parity`).toEqual(
		response.expectedJsonText,
	);
}

describe("deterministic structured-read MCP contracts", () => {
	let harness: MockedMcpHarness | null = null;
	let restoreExternalNetworking: (() => void) | undefined;

	beforeAll(() => {
		restoreExternalNetworking = disableMockedMcpExternalNetworking(() =>
			nock.enableNetConnect(),
		);
	});

	beforeEach(async () => {
		harness = await createMockedMcpHarness({
			name: "structured-read-contracts",
			register: registerHevyMcp,
		});
	});

	afterEach(async () => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		const harnessToClose = harness;
		harness = null;
		await teardownMockedMcpTestState(harnessToClose);
	});

	afterAll(() => {
		restoreExternalNetworking?.();
	});

	it("tracks exactly every runtime-registered structured read-only tool", async () => {
		if (!harness) throw new Error("Harness not initialized");
		const { tools } = await harness.client.listTools();
		const registeredReads = tools
			.filter(
				(tool) =>
					tool.annotations?.readOnlyHint === true &&
					tool.outputSchema !== undefined,
			)
			.map(({ name }) => name);

		expect(READ_TOOL_CONTRACTS).toHaveLength(15);
		expect(sorted(READ_TOOL_CONTRACTS.map(({ name }) => name))).toEqual(
			sorted(registeredReads),
		);
	});

	it("keeps the shared structured-read inventory in sync", () => {
		const inventoriedReads = MCP_TOOL_CONTRACTS.filter(
			({ kind, structuredOutput }) => kind === "read" && structuredOutput,
		).map(({ name }) => name);

		expect(sorted(READ_TOOL_CONTRACTS.map(({ name }) => name))).toEqual(
			sorted(inventoriedReads),
		);
		expect(
			READ_TOOL_CONTRACTS.filter(
				({ invalidArguments }) => invalidArguments === null,
			).map(({ name }) => name),
		).toEqual(["get-workout-count", "get-user-info"]);
	});

	for (const contract of READ_TOOL_CONTRACTS) {
		describe(contract.name, () => {
			it("returns schema-valid structured content with exact JSON parity", async () => {
				if (!harness) throw new Error("Harness not initialized");
				const requests = mockResponse(contract, contract.success.body);

				const result = await callTool(
					harness.client,
					contract.name,
					{ ...contract.validArguments },
					{ requireStructuredContentForReadTools: true },
				);

				expectSuccessfulJsonParity(contract, contract.success, result);
				expect(requests.requestCount()).toBe(1);
			});

			it("returns its schema-valid semantic empty or null contract", async () => {
				if (!harness) throw new Error("Harness not initialized");
				const requests = mockResponse(contract, contract.empty.body);

				const result = await callTool(
					harness.client,
					contract.name,
					{ ...contract.validArguments },
					{ requireStructuredContentForReadTools: true },
				);

				const structured = parseStructuredContent(
					contract,
					result.structuredContent,
				);
				expect(result.isError, contract.name).toBeFalsy();
				expect(
					structured,
					`${contract.name} exact empty structuredContent`,
				).toEqual(contract.empty.expectedStructured);
				if (contract.empty.emptyText !== undefined) {
					expect(result.text).toBe(contract.empty.emptyText);
				} else {
					expectSuccessfulJsonParity(contract, contract.empty, result);
				}
				expect(requests.requestCount()).toBe(1);
			});

			if (contract.invalidArguments !== null) {
				it("rejects schema-invalid input before any upstream request", async () => {
					if (!harness) throw new Error("Harness not initialized");
					const requests = mockOptionalValidationProbe(contract);

					const result = await callTool(harness.client, contract.name, {
						...contract.invalidArguments,
					});

					expect(result.isError).toBe(true);
					expect(result.text).toContain(
						`Invalid arguments for tool ${contract.name}`,
					);
					expect(result.structuredContent).toBeUndefined();
					expect(requests.requestCount()).toBe(0);
				});
			}

			it(`surfaces its upstream failure after exactly ${contract.upstreamFailure.attempts} request(s)`, async () => {
				if (!harness) throw new Error("Harness not initialized");
				vi.spyOn(console, "error").mockImplementation(() => undefined);
				const requests = mockFailure(contract);
				const usesRetries = contract.upstreamFailure.attempts === 4;

				let result: Awaited<ReturnType<typeof callTool>>;
				try {
					const outcomePromise = callTool(harness.client, contract.name, {
						...contract.validArguments,
					}).then(
						(value) => ({ value }),
						(error: unknown) => ({ error }),
					);
					if (usesRetries) {
						while (requests.requestCount() === 0) {
							await new Promise<void>((resolve) => setImmediate(resolve));
						}
						vi.useFakeTimers({ toFake: ["setTimeout"] });
						while (
							requests.requestCount() < contract.upstreamFailure.attempts
						) {
							await vi.advanceTimersToNextTimerAsync();
						}
					}
					const outcome = await outcomePromise;
					if ("error" in outcome) throw outcome.error;
					result = outcome.value;
				} finally {
					if (usesRetries) vi.useRealTimers();
				}

				expect(result.isError).toBe(true);
				expect(result.text).toBe(contract.upstreamFailure.expectedText);
				expect(result.structuredContent).toBeUndefined();
				expect(requests.requestCount()).toBe(contract.upstreamFailure.attempts);
			}, 10_000);
		});
	}
});
