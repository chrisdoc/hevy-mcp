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

const workout = createWorkoutFixture();
const routine = createRoutineFixture();
const exerciseTemplate = createExerciseTemplateFixture();
const routineFolder = createRoutineFolderFixture();
const bodyMeasurement = createBodyMeasurementFixture();
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
		success: { body: createWorkoutsResponse([workout], { page: 2 }) },
		empty: {
			body: createWorkoutsResponse([], { page: 2 }),
			emptyText: "No workouts found for the specified parameters",
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
		success: { body: workout },
		empty: {
			body: null,
			emptyText: "Workout with ID workout-1 not found",
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
		success: { body: createWorkoutCountResponse(42) },
		empty: { body: createWorkoutCountResponse(0) },
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
		},
		empty: {
			body: { page: 1, page_count: 1, events: [] },
			emptyText: `No workout events found for the specified parameters since ${defaultSince}`,
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
		success: { body: createRoutinesResponse([routine]) },
		empty: {
			body: createRoutinesResponse([]),
			emptyText: "No routines found for the specified parameters",
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
		success: { body: { routine } },
		empty: {
			body: {},
			emptyText: "Routine with ID routine-1 not found",
		},
		upstreamFailure: {
			status: 500,
			responseBody: { error: "server failure" },
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
		},
		empty: {
			body: createExerciseTemplatesResponse([], { page: 3 }),
			emptyText: "No exercise templates found for the specified parameters",
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
		success: { body: exerciseTemplate },
		empty: {
			body: null,
			emptyText: "Exercise template with ID template-1 not found",
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
		},
		empty: {
			body: { exercise_history: [] },
			emptyText: "No exercise history found for template template-1",
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
		success: { body: createExerciseTemplatesResponse([exerciseTemplate]) },
		empty: {
			body: createExerciseTemplatesResponse([
				createExerciseTemplateFixture({ id: "template-2", title: "Squat" }),
			]),
			emptyText:
				'No exercise templates found matching "bench" with primary muscle group "chest"',
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
		success: { body: createRoutineFoldersResponse([routineFolder]) },
		empty: {
			body: createRoutineFoldersResponse([]),
			emptyText: "No routine folders found for the specified parameters",
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
		success: { body: routineFolder },
		empty: {
			body: null,
			emptyText: "Routine folder with ID 10 not found",
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
		success: { body: createBodyMeasurementsResponse([bodyMeasurement]) },
		empty: {
			body: createBodyMeasurementsResponse([]),
			emptyText: "No body measurements found for the specified parameters",
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
		success: { body: bodyMeasurement },
		empty: {
			body: null,
			emptyText: "No body measurement found for date 2025-03-25",
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
		success: { body: createUserInfoResponse() },
		empty: {
			body: {},
			emptyText: "No user info found for the authenticated user",
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

function validateStructuredContent(
	contract: ReadToolContract,
	structuredContent: Record<string, unknown> | undefined,
): Record<string, unknown> {
	expect(structuredContent, `${contract.name} structuredContent`).toBeDefined();
	return z.object(contract.outputSchema).parse(structuredContent);
}

function expectSuccessfulJsonParity(
	contract: ReadToolContract,
	result: Awaited<ReturnType<typeof callTool>>,
): void {
	const structured = validateStructuredContent(
		contract,
		result.structuredContent,
	);
	const parsedText = parseToolText<unknown>(result, contract.name);
	const expectedTextPayload =
		contract.outputKey === "count"
			? structured
			: structured[contract.outputKey];

	expect(result.isError, contract.name).toBeFalsy();
	expect(parsedText, `${contract.name} JSON text parity`).toEqual(
		expectedTextPayload,
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
		vi.restoreAllMocks();
		const harnessToClose = harness;
		harness = null;
		await teardownMockedMcpTestState(harnessToClose);
	});

	afterAll(() => {
		restoreExternalNetworking?.();
	});

	it("tracks exactly every structured read in the production inventory", () => {
		const inventoriedReads = MCP_TOOL_CONTRACTS.filter(
			({ kind, structuredOutput }) => kind === "read" && structuredOutput,
		).map(({ name }) => name);

		expect(READ_TOOL_CONTRACTS).toHaveLength(15);
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

				expectSuccessfulJsonParity(contract, result);
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

				validateStructuredContent(contract, result.structuredContent);
				expect(result.isError, contract.name).toBeFalsy();
				if (contract.empty.emptyText !== undefined) {
					expect(result.text).toBe(contract.empty.emptyText);
				} else {
					expectSuccessfulJsonParity(contract, result);
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

				const result = await callTool(harness.client, contract.name, {
					...contract.validArguments,
				});

				expect(result.isError).toBe(true);
				expect(result.text).toBe(contract.upstreamFailure.expectedText);
				expect(result.structuredContent).toBeUndefined();
				expect(requests.requestCount()).toBe(contract.upstreamFailure.attempts);
			}, 10_000);
		});
	}
});
