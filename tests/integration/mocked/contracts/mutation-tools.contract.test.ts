import nock from "nock";
import {
	CallToolResultSchema,
	type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { registerHevyMcp } from "../../../../src/mcp-registration.js";
import {
	callTool,
	cleanupMockedMcpTestState,
	createMockedApiScope,
	createMockedMcpHarness,
	disableMockedMcpExternalNetworking,
	parseToolText,
	type MockedMcpHarness,
} from "../../../support/mocked-mcp.js";

type HttpMethod = "post" | "put";

interface MutationContract {
	readonly name:
		| "create-workout"
		| "update-workout"
		| "create-routine"
		| "update-routine"
		| "create-exercise-template"
		| "create-routine-folder"
		| "create-body-measurement"
		| "update-body-measurement";
	readonly method: HttpMethod;
	readonly path: string;
	readonly args: Record<string, unknown>;
	readonly body: nock.RequestBodyMatcher;
	readonly successStatus: number;
	readonly successBody: nock.Body;
	readonly expectedText: string;
	readonly expectedJson?: unknown;
}

const workoutArgs = {
	title: "Contract Workout",
	description: "Deterministic mutation contract",
	startTime: "2026-07-10T10:00:00Z",
	endTime: "2026-07-10T11:05:00Z",
	isPrivate: true,
	exercises: [
		{
			exerciseTemplateId: "template-101",
			supersetId: 7,
			notes: "Controlled tempo",
			sets: [
				{
					type: "normal",
					weightKg: 82.5,
					reps: 8,
					distanceMeters: 120,
					durationSeconds: 45,
					rpe: 8,
					customMetric: 3.5,
				},
			],
		},
	],
};

const workoutBody = {
	workout: {
		title: "Contract Workout",
		description: "Deterministic mutation contract",
		start_time: "2026-07-10T10:00:00Z",
		end_time: "2026-07-10T11:05:00Z",
		is_private: true,
		exercises: [
			{
				exercise_template_id: "template-101",
				superset_id: 7,
				notes: "Controlled tempo",
				sets: [
					{
						type: "normal",
						weight_kg: 82.5,
						reps: 8,
						distance_meters: 120,
						duration_seconds: 45,
						rpe: 8,
						custom_metric: 3.5,
					},
				],
			},
		],
	},
};

const workoutResponse = {
	id: "workout-607",
	title: "Contract Workout",
	description: "Deterministic mutation contract",
	start_time: "2026-07-10T10:00:00Z",
	end_time: "2026-07-10T11:05:00Z",
	created_at: "2026-07-10T11:05:01Z",
	updated_at: "2026-07-10T11:05:01Z",
	exercises: [],
};

const formattedWorkout = {
	id: "workout-607",
	title: "Contract Workout",
	description: "Deterministic mutation contract",
	startTime: "2026-07-10T10:00:00Z",
	endTime: "2026-07-10T11:05:00Z",
	createdAt: "2026-07-10T11:05:01Z",
	updatedAt: "2026-07-10T11:05:01Z",
	duration: "1h 5m 0s",
	exercises: [],
};

const routineArgs = {
	title: "Contract Routine",
	notes: "Pinned mapping",
	exercises: [
		{
			exerciseTemplateId: "template-202",
			supersetId: 4,
			restSeconds: 90,
			notes: "Pause at the bottom",
			sets: [
				{
					type: "warmup",
					weightKg: 60,
					reps: 10,
					distanceMeters: 25,
					durationSeconds: 30,
					customMetric: 1.25,
					repRange: { start: 10, end: 10 },
				},
			],
		},
	],
};

const routineExerciseBody = {
	exercise_template_id: "template-202",
	superset_id: 4,
	rest_seconds: 90,
	notes: "Pause at the bottom",
	sets: [
		{
			type: "warmup",
			weight_kg: 60,
			reps: 10,
			distance_meters: 25,
			duration_seconds: 30,
			custom_metric: 1.25,
			rep_range: { start: 10, end: 10 },
		},
	],
};

const routineResponse = {
	id: "routine-607",
	title: "Contract Routine",
	folder_id: 12,
	created_at: "2026-07-10T09:00:00Z",
	updated_at: "2026-07-10T09:00:00Z",
	exercises: [],
};

const formattedRoutine = {
	id: "routine-607",
	title: "Contract Routine",
	folderId: 12,
	createdAt: "2026-07-10T09:00:00Z",
	updatedAt: "2026-07-10T09:00:00Z",
	exercises: [],
};

const folderResponse = {
	id: 607,
	title: "Contract Folder",
	created_at: "2026-07-10T08:00:00Z",
	updated_at: "2026-07-10T08:00:00Z",
};

const formattedFolder = {
	id: 607,
	title: "Contract Folder",
	createdAt: "2026-07-10T08:00:00Z",
	updatedAt: "2026-07-10T08:00:00Z",
};

const mutationContracts: readonly MutationContract[] = [
	{
		name: "create-workout",
		method: "post",
		path: "/v1/workouts",
		args: workoutArgs,
		body: workoutBody,
		successStatus: 201,
		successBody: workoutResponse,
		expectedText: JSON.stringify(formattedWorkout, null, 2),
		expectedJson: formattedWorkout,
	},
	{
		name: "update-workout",
		method: "put",
		path: "/v1/workouts/workout-607",
		args: { workoutId: "workout-607", ...workoutArgs },
		body: workoutBody,
		successStatus: 200,
		successBody: workoutResponse,
		expectedText: JSON.stringify(formattedWorkout, null, 2),
		expectedJson: formattedWorkout,
	},
	{
		name: "create-routine",
		method: "post",
		path: "/v1/routines",
		args: { folderId: 12, ...routineArgs },
		body: {
			routine: {
				title: "Contract Routine",
				folder_id: 12,
				notes: "Pinned mapping",
				exercises: [routineExerciseBody],
			},
		},
		successStatus: 201,
		successBody: routineResponse,
		expectedText: JSON.stringify(formattedRoutine, null, 2),
		expectedJson: formattedRoutine,
	},
	{
		name: "update-routine",
		method: "put",
		path: "/v1/routines/routine-607",
		args: { routineId: "routine-607", ...routineArgs },
		body: {
			routine: {
				title: "Contract Routine",
				notes: "Pinned mapping",
				exercises: [routineExerciseBody],
			},
		},
		successStatus: 200,
		successBody: routineResponse,
		expectedText: JSON.stringify(formattedRoutine, null, 2),
		expectedJson: formattedRoutine,
	},
	{
		name: "create-exercise-template",
		method: "post",
		path: "/v1/exercise_templates",
		args: {
			title: "Contract Curl",
			exerciseType: "weight_reps",
			equipmentCategory: "dumbbell",
			muscleGroup: "biceps",
			otherMuscles: ["forearms"],
		},
		body: {
			exercise: {
				title: "Contract Curl",
				exercise_type: "weight_reps",
				equipment_category: "dumbbell",
				muscle_group: "biceps",
				other_muscles: ["forearms"],
			},
		},
		successStatus: 200,
		successBody: { id: 607 },
		expectedText: JSON.stringify(
			{ id: 607, message: "Exercise template created successfully" },
			null,
			2,
		),
		expectedJson: {
			id: 607,
			message: "Exercise template created successfully",
		},
	},
	{
		name: "create-routine-folder",
		method: "post",
		path: "/v1/routine_folders",
		args: { name: "Contract Folder" },
		body: { routine_folder: { title: "Contract Folder" } },
		successStatus: 201,
		successBody: folderResponse,
		expectedText: JSON.stringify(formattedFolder, null, 2),
		expectedJson: formattedFolder,
	},
	{
		name: "create-body-measurement",
		method: "post",
		path: "/v1/body_measurements",
		args: {
			date: "2026-07-10",
			weightKg: 80.5,
			leanMassKg: null,
			fatPercent: 17.25,
			chestCm: 101,
		},
		body: {
			date: "2026-07-10",
			weight_kg: 80.5,
			fat_percent: 17.25,
			chest_cm: 101,
		},
		successStatus: 200,
		successBody: {},
		expectedText: "Body measurement for 2026-07-10 created successfully.",
	},
	{
		name: "update-body-measurement",
		method: "put",
		path: "/v1/body_measurements/2026-07-10",
		args: {
			date: "2026-07-10",
			weightKg: 79.75,
			waist: 82,
			rightCalf: null,
		},
		body: { weight_kg: 79.75, waist: 82 },
		successStatus: 200,
		successBody: {},
		expectedText: "Body measurement for 2026-07-10 updated successfully.",
	},
];

const contractsByName = new Map(
	mutationContracts.map((contract) => [contract.name, contract]),
);

interface ValidationCase {
	readonly name: MutationContract["name"];
	readonly label: string;
	readonly args: Record<string, unknown>;
	readonly expectedText: string;
}

const validationCases: readonly ValidationCase[] = [
	{
		name: "create-workout",
		label: "requires a title",
		args: { ...workoutArgs, title: "" },
		expectedText: "title",
	},
	{
		name: "update-workout",
		label: "requires a strict UTC end timestamp",
		args: { workoutId: "workout-607", ...workoutArgs, endTime: "2026-07-10" },
		expectedText: "endTime",
	},
	{
		name: "create-routine",
		label: "rejects negative nested restSeconds",
		args: {
			...routineArgs,
			exercises: [{ ...routineArgs.exercises[0], restSeconds: -1 }],
		},
		expectedText: "restSeconds",
	},
	{
		name: "update-routine",
		label: "requires nested exercise template identity",
		args: {
			routineId: "routine-607",
			...routineArgs,
			exercises: [{ ...routineArgs.exercises[0], exerciseTemplateId: "" }],
		},
		expectedText: "exerciseTemplateId",
	},
	{
		name: "create-exercise-template",
		label: "rejects an unsupported enum value",
		args: {
			title: "Contract Curl",
			exerciseType: "weight_reps",
			equipmentCategory: "cable",
			muscleGroup: "biceps",
		},
		expectedText: "equipmentCategory",
	},
	{
		name: "create-routine-folder",
		label: "requires a non-empty name",
		args: { name: "" },
		expectedText: "name",
	},
	{
		name: "create-body-measurement",
		label: "requires a YYYY-MM-DD date",
		args: { date: "07/10/2026", weightKg: 80 },
		expectedText: "Date must be in YYYY-MM-DD format",
	},
	{
		name: "update-body-measurement",
		label: "rejects a non-numeric measurement",
		args: { date: "2026-07-10", weightKg: "not-a-number" },
		expectedText: "weightKg",
	},
];

interface UpstreamErrorCase {
	readonly name: MutationContract["name"];
	readonly label: string;
	readonly status?: number;
	readonly response?: nock.Body;
	readonly transportError?: string;
	readonly expectedText: string;
}

const upstreamErrorCases: readonly UpstreamErrorCase[] = [
	{
		name: "create-workout",
		label: "400 validation response",
		status: 400,
		response: { error: "invalid workout payload" },
		expectedText: '[create-workout] Error: {"error":"invalid workout payload"}',
	},
	{
		name: "update-workout",
		label: "503 transient response",
		status: 503,
		response: { error: "temporarily unavailable" },
		expectedText:
			"[update-workout-operation] Error: Hevy API experienced an error. Please retry later.",
	},
	{
		name: "create-routine",
		label: "403 authorization response",
		status: 403,
		response: { error: "forbidden" },
		expectedText:
			"[create-routine] Error: The Hevy API key is invalid or has expired. Check HEVY_API_KEY.",
	},
	{
		name: "update-routine",
		label: "404 missing routine response",
		status: 404,
		response: { error: "missing" },
		expectedText:
			"[update-routine] Error: The requested resource was not found in Hevy.",
	},
	{
		name: "create-exercise-template",
		label: "422 Hevy validation response",
		status: 422,
		response: { error: "invalid enum combination" },
		expectedText:
			"[create-exercise-template] Error: The request failed Hevy validation. Check the field values and try again.",
	},
	{
		name: "create-routine-folder",
		label: "401 authentication response",
		status: 401,
		response: { error: "unauthorized" },
		expectedText:
			"[create-routine-folder] Error: The Hevy API key is invalid or has expired. Check HEVY_API_KEY.",
	},
	{
		name: "create-body-measurement",
		label: "409 duplicate-date response",
		status: 409,
		response: { error: "already exists" },
		expectedText:
			"[create-body-measurement] Error: A conflict occurred (e.g., a body measurement already exists for this date). Use the update tool instead.",
	},
	{
		name: "update-body-measurement",
		label: "429 transient rate-limit response",
		status: 429,
		response: { error: "rate limited" },
		expectedText:
			"[update-body-measurement] Error: Rate limited by Hevy (HTTP 429). Please wait and retry your request.",
	},
	{
		name: "create-workout",
		label: "transport reset",
		transportError: "socket hang up",
		expectedText: "[create-workout] Error: socket hang up",
	},
];

function requiredContract(name: MutationContract["name"]): MutationContract {
	const contract = contractsByName.get(name);
	if (!contract) throw new Error(`Missing mutation contract for ${name}`);
	return contract;
}

function addRequestInterceptor(
	contract: MutationContract,
	status: number,
	response: nock.Body,
) {
	const scope = createMockedApiScope();
	return scope[contract.method](contract.path, contract.body).reply(
		status,
		response,
	);
}

async function createHarness(name: string): Promise<MockedMcpHarness> {
	return createMockedMcpHarness({ name, register: registerHevyMcp });
}

async function callRawTool(
	client: MockedMcpHarness["client"],
	name: string,
	arguments_: Record<string, unknown>,
): Promise<CallToolResult> {
	return client.request(
		{
			method: "tools/call",
			params: { name, arguments: arguments_ },
		},
		CallToolResultSchema,
	);
}

function expectExactTextContent(
	result: CallToolResult,
	expectedText: string,
): string {
	expect(result.content).toEqual([{ type: "text", text: expectedText }]);
	expect(result.structuredContent).toBeUndefined();

	const content = result.content[0];
	if (!content || content.type !== "text") {
		throw new Error("Expected exactly one MCP text content item");
	}
	return content.text;
}

function expectPublicError(result: CallToolResult, expectedText: string): void {
	expect(result.isError).toBe(true);
	expectExactTextContent(result, expectedText);
}

describe("deterministic mutation MCP contracts", () => {
	let restoreExternalNetworking: (() => void) | undefined;
	let restoreConsoleError: (() => void) | undefined;

	beforeAll(() => {
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		restoreConsoleError = () => consoleErrorSpy.mockRestore();
		restoreExternalNetworking = disableMockedMcpExternalNetworking(() =>
			nock.enableNetConnect(),
		);
	});

	afterEach(async () => {
		await cleanupMockedMcpTestState();
	});

	afterAll(() => {
		restoreExternalNetworking?.();
		restoreConsoleError?.();
	});

	it.each(mutationContracts)(
		"$name sends canonical $method $path and returns its exact public success contract",
		async (contract) => {
			addRequestInterceptor(
				contract,
				contract.successStatus,
				contract.successBody,
			);
			const harness = await createHarness(`${contract.name}-success`);

			try {
				const result = await callRawTool(
					harness.client,
					contract.name,
					contract.args,
				);

				expect(result.isError).toBeUndefined();
				const text = expectExactTextContent(result, contract.expectedText);
				if (contract.expectedJson !== undefined) {
					expect(
						parseToolText({ text }, `${contract.name} success response`),
					).toEqual(contract.expectedJson);
				}
			} finally {
				await harness.close();
			}
		},
	);

	it.each(validationCases)(
		"$name schema validation: $label with zero upstream requests",
		async ({ name, args, expectedText }) => {
			const contract = requiredContract(name);
			let requestCount = 0;
			const scope = createMockedApiScope();
			scope.on("request", () => requestCount++);
			scope[contract.method](contract.path).optionally().reply(200, {});
			const harness = await createHarness(`${name}-schema-validation`);

			try {
				const result = await callTool(harness.client, name, args);

				expect(result.isError).toBe(true);
				expect(result.structuredContent).toBeUndefined();
				expect(result.text).toContain("Invalid arguments for tool");
				expect(result.text).toContain(expectedText);
				expect(requestCount).toBe(0);
			} finally {
				await harness.close();
			}
		},
	);

	it("pins update-body-measurement date-only handler validation with zero HTTP", async () => {
		const contract = requiredContract("update-body-measurement");
		let requestCount = 0;
		const scope = createMockedApiScope();
		scope.on("request", () => requestCount++);
		scope.put(contract.path).optionally().reply(200, {});
		const harness = await createHarness("update-body-measurement-date-only");

		try {
			const result = await callRawTool(harness.client, contract.name, {
				date: "2026-07-10",
			});

			expectPublicError(
				result,
				"[update-body-measurement] Error: No measurement fields provided. Include at least one numeric measurement field (e.g. weightKg) to update.",
			);
			expect(result.content[0]).toEqual({
				type: "text",
				text: expect.not.stringContaining("Invalid arguments for tool"),
			});
			expect(requestCount).toBe(0);
		} finally {
			await harness.close();
		}
	});

	it.each(upstreamErrorCases)(
		"$name upstream error: $label issues exactly one write request",
		async ({ name, status, response, transportError, expectedText }) => {
			const contract = requiredContract(name);
			let requestCount = 0;
			const scope = createMockedApiScope();
			scope.on("request", () => requestCount++);
			const interceptor = scope[contract.method](contract.path, contract.body);
			if (transportError) {
				interceptor.replyWithError(transportError);
				scope[contract.method](contract.path, contract.body)
					.optionally()
					.reply(contract.successStatus, contract.successBody);
			} else {
				scope.persist();
				interceptor.reply(status ?? 500, response);
			}
			const harness = await createHarness(`${name}-upstream-error`);

			try {
				const result = await callRawTool(
					harness.client,
					contract.name,
					contract.args,
				);

				expectPublicError(result, expectedText);
				expect(requestCount).toBe(1);
			} finally {
				await harness.close();
			}
		},
	);
});
