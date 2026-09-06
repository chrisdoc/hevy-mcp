import type { HevyClient, HevyExecutionOptions } from "@hevy-mcp/hevy-client";
import { HevyHttpError } from "@hevy-mcp/hevy-client";
import type {
	GetV1Workouts200,
	GetV1WorkoutsCountStatus200,
	GetV1WorkoutsWorkoutid200,
	PostV1WorkoutsStatus201,
	PutV1WorkoutsWorkoutidStatus200,
} from "@hevy-mcp/hevy-client/types";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
	createWorkoutsCountOperation,
	createWorkoutsCreateOperation,
	createWorkoutsGetOperation,
	createWorkoutsListOperation,
	createWorkoutsReplaceExercisesOperation,
	createWorkoutsUpdateOperation,
	type WorkoutsCountAdapter,
	type WorkoutsCreateAdapter,
	type WorkoutsGetAdapter,
	type WorkoutsListAdapter,
	type WorkoutsReplaceExercisesInput,
	type WorkoutsUpdateAdapter,
} from "./workouts.js";
import {
	PaginationMismatchError,
	WorkoutPayloadError,
} from "./operation-errors.js";
import { NotFoundError } from "@hevy-mcp/hevy-client";

interface InMemoryWorkoutsAdapter extends WorkoutsListAdapter {
	readonly requests: Array<{
		readonly params: Parameters<HevyClient["getWorkouts"]>[0];
		readonly options: Parameters<HevyClient["getWorkouts"]>[1];
	}>;
	readonly argumentCounts: number[];
}

function createInMemoryAdapter(
	responses: readonly (GetV1Workouts200 | Error)[],
): InMemoryWorkoutsAdapter {
	let responseIndex = 0;
	const requests: InMemoryWorkoutsAdapter["requests"] = [];
	const argumentCounts: InMemoryWorkoutsAdapter["argumentCounts"] = [];
	return {
		requests,
		argumentCounts,
		getWorkouts(params, options) {
			argumentCounts.push(arguments.length);
			requests.push({ params, options });
			const response = responses[responseIndex++] ?? { workouts: [] };
			if (response instanceof Error) return Effect.fail(response);
			return Effect.succeed(response);
		},
	};
}

function httpError(
	status: number,
	method: string,
	endpoint: string,
	message = "request failed",
) {
	return new HevyHttpError(message, {
		status,
		method,
		endpoint,
	});
}

function notFound(endpoint = "/v1/workouts", method = "GET") {
	return httpError(404, method, endpoint, "not found");
}

interface InMemoryWorkoutsGetAdapter extends WorkoutsGetAdapter {
	readonly requests: Array<{
		readonly workoutId: Parameters<HevyClient["getWorkout"]>[0];
		readonly options: Parameters<HevyClient["getWorkout"]>[1];
	}>;
	readonly argumentCounts: number[];
}

function abortable<T>(
	options: HevyExecutionOptions | undefined,
	error: Error,
): Effect.Effect<T, Error> {
	const signal = options?.signal;
	if (signal === undefined) return Effect.fail(error);
	return Effect.callback((resume) => {
		const rejectOnAbort = () => {
			signal.removeEventListener("abort", rejectOnAbort);
			const reason = signal.reason;
			resume(Effect.fail(reason instanceof Error ? reason : error));
		};
		if (signal.aborted) {
			rejectOnAbort();
		} else {
			signal.addEventListener("abort", rejectOnAbort, { once: true });
		}
		return Effect.sync(() =>
			signal.removeEventListener("abort", rejectOnAbort),
		);
	});
}

function createInMemoryGetAdapter(
	responses?:
		| GetV1WorkoutsWorkoutid200
		| Error
		| readonly (GetV1WorkoutsWorkoutid200 | Error | undefined)[],
): InMemoryWorkoutsGetAdapter {
	const requests: InMemoryWorkoutsGetAdapter["requests"] = [];
	const argumentCounts: InMemoryWorkoutsGetAdapter["argumentCounts"] = [];
	const responseSequence = Array.isArray(responses) ? responses : [responses];
	let responseIndex = 0;
	return {
		requests,
		argumentCounts,
		getWorkout(workoutId, options) {
			argumentCounts.push(arguments.length);
			requests.push({ workoutId, options });
			const response = responseSequence[responseIndex++];
			if (response instanceof Error) return Effect.fail(response);
			return Effect.succeed(response as GetV1WorkoutsWorkoutid200);
		},
	};
}

function createAbortAwareGetAdapter(error: Error): InMemoryWorkoutsGetAdapter {
	const requests: InMemoryWorkoutsGetAdapter["requests"] = [];
	const argumentCounts: InMemoryWorkoutsGetAdapter["argumentCounts"] = [];
	return {
		requests,
		argumentCounts,
		getWorkout(workoutId, options) {
			argumentCounts.push(arguments.length);
			requests.push({ workoutId, options });
			return abortable<GetV1WorkoutsWorkoutid200>(options, error);
		},
	};
}

function createAbortAwareListAdapter(error: Error): InMemoryWorkoutsAdapter {
	const requests: InMemoryWorkoutsAdapter["requests"] = [];
	const argumentCounts: InMemoryWorkoutsAdapter["argumentCounts"] = [];
	return {
		requests,
		argumentCounts,
		getWorkouts(params, options) {
			argumentCounts.push(arguments.length);
			requests.push({ params, options });
			return abortable<GetV1Workouts200>(options, error);
		},
	};
}

describe("workouts.get operation", () => {
	it("[VAL-OPS-001] succeeds with the workout entity and preserves the read descriptor", async () => {
		const adapter = createInMemoryGetAdapter({ id: "w1" });
		const operation = createWorkoutsGetOperation(adapter);
		const signal = new AbortController().signal;
		const options: HevyExecutionOptions = {
			signal,
			deadline: Date.now() + 5_000,
		};

		await expect(
			operation.execute({ workoutId: "w1" }, options),
		).resolves.toEqual({ workout: { id: "w1" } });
		expect(operation.descriptor).toEqual({
			id: "workouts.get",
			safety: "read",
		});
		expect(adapter.requests).toEqual([{ workoutId: "w1", options }]);
		expect(adapter.requests[0]?.options).toBe(options);
	});

	it("[VAL-OPS-010] normalizes a missing workout response to null without a soft-404 outcome", async () => {
		const operation = createWorkoutsGetOperation(createInMemoryGetAdapter());

		await expect(operation.execute({ workoutId: "missing" })).resolves.toEqual({
			workout: null,
		});
	});

	it("[VAL-OPS-010] returns not_found only for the canonical workout resource 404", async () => {
		const operation = createWorkoutsGetOperation(
			createInMemoryGetAdapter(notFound("/v1/workouts/w1")),
		);

		await expect(operation.execute({ workoutId: "w1" })).resolves.toEqual({
			workout: null,
			expected404Outcome: "not_found",
		});
	});

	it("rejects an unrelated GET 404 with the original error", async () => {
		const error = notFound("/v1/routines/r1");
		const operation = createWorkoutsGetOperation(
			createInMemoryGetAdapter(error),
		);

		await expect(operation.execute({ workoutId: "w1" })).rejects.toBe(error);
	});

	it("[VAL-OPS-005] rejects a mutation 404 with the original error", async () => {
		const error = notFound("/v1/workouts/w1", "POST");
		const operation = createWorkoutsGetOperation(
			createInMemoryGetAdapter(error),
		);

		await expect(operation.execute({ workoutId: "w1" })).rejects.toBe(error);
	});

	it("[VAL-OPS-005] preserves non-404 error identity for workouts.get", async () => {
		const error = httpError(503, "GET", "/v1/workouts/w1", "upstream failure");
		const operation = createWorkoutsGetOperation(
			createInMemoryGetAdapter(error),
		);

		await expect(operation.execute({ workoutId: "w1" })).rejects.toBe(error);
	});

	it("[VAL-OPS-010] rejects a collection-path GET 404 for workouts.get", async () => {
		const error = notFound("/v1/workouts");
		const operation = createWorkoutsGetOperation(
			createInMemoryGetAdapter(error),
		);

		await expect(operation.execute({ workoutId: "w1" })).rejects.toBe(error);
	});

	it("[VAL-OPS-008] omits the options argument when workouts.get options are absent", async () => {
		const adapter = createInMemoryGetAdapter({ id: "w1" });
		const operation = createWorkoutsGetOperation(adapter);

		await expect(operation.execute({ workoutId: "w1" })).resolves.toEqual({
			workout: { id: "w1" },
		});
		expect(adapter.argumentCounts).toEqual([1]);
	});
});

describe("workouts.list operation", () => {
	it("[VAL-OPS-009] succeeds with the requested page and preserves the read descriptor", async () => {
		const adapter = createInMemoryAdapter([
			{
				page: 2,
				page_count: 4,
				workouts: [{ id: "w1" }],
			},
		]);
		const operation = createWorkoutsListOperation(adapter);
		const signal = new AbortController().signal;
		const options: HevyExecutionOptions = {
			signal,
			deadline: Date.now() + 5_000,
		};

		await expect(
			operation.execute({ page: 2, pageSize: 10 }, options),
		).resolves.toEqual({
			items: [{ id: "w1" }],
			page: 2,
			pageCount: 4,
		});
		expect(operation.descriptor).toEqual({
			id: "workouts.list",
			safety: "read",
		});
		expect(adapter.requests).toEqual([
			{
				params: { page: 2, pageSize: 10 },
				options,
			},
		]);
		expect(adapter.requests[0]?.options).toBe(options);
	});

	it("[VAL-OPS-004] treats a later-page collection 404 as the end of the list", async () => {
		const adapter = createInMemoryAdapter([notFound()]);
		const operation = createWorkoutsListOperation(adapter);

		await expect(operation.execute({ page: 3, pageSize: 5 })).resolves.toEqual({
			items: [],
			page: 3,
			pageCount: undefined,
			expected404Outcome: "end_of_list",
		});
	});

	it("[VAL-OPS-004] rejects a first-page collection 404", async () => {
		const error = notFound();
		const firstPageAdapter = createInMemoryAdapter([error]);
		const firstPageOperation = createWorkoutsListOperation(firstPageAdapter);
		await expect(
			firstPageOperation.execute({ page: 1, pageSize: 5 }),
		).rejects.toBe(error);
	});

	it("[VAL-OPS-004] rejects an unrelated collection 404 with the original error", async () => {
		const error = notFound("/v1/routines");
		const unrelatedAdapter = createInMemoryAdapter([error]);
		const unrelatedOperation = createWorkoutsListOperation(unrelatedAdapter);
		await expect(
			unrelatedOperation.execute({ page: 2, pageSize: 5 }),
		).rejects.toBe(error);
	});

	it("[VAL-OPS-004] rejects a mutation 404 for workouts.list with the original error", async () => {
		const error = notFound("/v1/workouts", "POST");
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([error]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).rejects.toBe(
			error,
		);
	});

	it("[VAL-OPS-005] preserves non-404 error identity for workouts.list", async () => {
		const error = new Error("network failure");
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([error]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).rejects.toBe(
			error,
		);
	});

	it("[VAL-OPS-004] rejects a member-path GET 404 for workouts.list", async () => {
		const error = notFound("/v1/workouts/w1");
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([error]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).rejects.toBe(
			error,
		);
	});

	it("[VAL-OPS-004] rejects a same-prefix sibling collection 404 for workouts.list", async () => {
		const error = notFound("/v1/workouts/count");
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([error]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).rejects.toBe(
			error,
		);
	});

	it("[VAL-OPS-009] keeps an empty 200 workouts list distinct from end_of_list", async () => {
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([
				{
					page: 2,
					page_count: 4,
					workouts: [],
				},
			]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).resolves.toEqual({
			items: [],
			page: 2,
			pageCount: 4,
		});
	});

	it("[VAL-OPS-009] normalizes an omitted workouts field to an empty list without a soft-404 outcome", async () => {
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([{ page: 2, page_count: 4 }]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).resolves.toEqual({
			items: [],
			page: 2,
			pageCount: 4,
		});
	});

	it("[VAL-OPS-009] allows workouts list responses to omit page_count", async () => {
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([{ page: 2, workouts: [{ id: "w1" }] }]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).resolves.toEqual({
			items: [{ id: "w1" }],
			page: 2,
			pageCount: undefined,
		});
	});

	it("[VAL-OPS-009] uses the requested page when workouts response.page is omitted", async () => {
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([{ page_count: 4, workouts: [{ id: "w1" }] }]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).resolves.toEqual({
			items: [{ id: "w1" }],
			page: 2,
			pageCount: 4,
		});
	});

	it("[VAL-OPS-008] omits the options argument when workouts.list options are absent", async () => {
		const adapter = createInMemoryAdapter([{ page: 1, workouts: [] }]);
		const operation = createWorkoutsListOperation(adapter);

		await expect(operation.execute({ page: 1, pageSize: 5 })).resolves.toEqual({
			items: [],
			page: 1,
			pageCount: undefined,
		});
		expect(adapter.argumentCounts).toEqual([1]);
	});

	it("[VAL-OPS-003] rejects when response page differs from requested page", async () => {
		const adapter = createInMemoryAdapter([
			{
				page: 3,
				page_count: 5,
				workouts: [{ id: "w1" }],
			},
		]);
		const operation = createWorkoutsListOperation(adapter);

		await expect(
			Effect.runPromise(operation.effect({ page: 2, pageSize: 10 })),
		).rejects.toMatchObject({
			_tag: "PaginationMismatchError",
			requested: 2,
			received: 3,
			collection: "workouts",
		});
	});

	it("[VAL-OPS-002] exposes workouts.get as a native Promise, not an Effect", async () => {
		const operation = createWorkoutsGetOperation(
			createInMemoryGetAdapter({ id: "w1" }),
		);

		const result = operation.execute({ workoutId: "w1" });

		expect(result).toBeInstanceOf(Promise);
		expect("then" in result).toBe(true);
		expect("pipe" in result).toBe(false);
		expect("_tag" in result).toBe(false);
		await expect(result).resolves.toEqual({ workout: { id: "w1" } });
	});

	it("[VAL-OPS-002] exposes workouts.list as a native Promise, not an Effect", async () => {
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([{ page: 1, workouts: [] }]),
		);

		const result = operation.execute({ page: 1, pageSize: 5 });

		expect(result).toBeInstanceOf(Promise);
		expect("then" in result).toBe(true);
		expect("pipe" in result).toBe(false);
		expect("_tag" in result).toBe(false);
		await expect(result).resolves.toEqual({
			items: [],
			page: 1,
			pageCount: undefined,
		});
	});

	it("[VAL-OPS-005] preserves a plain network error for workouts.get", async () => {
		const error = new Error("network failure");
		const operation = createWorkoutsGetOperation(
			createInMemoryGetAdapter(error),
		);

		await expect(operation.execute({ workoutId: "w1" })).rejects.toBe(error);
	});

	it("[VAL-OPS-005] preserves a non-404 HTTP error for workouts.list", async () => {
		const error = httpError(429, "GET", "/v1/workouts", "rate limited");
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([error]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).rejects.toBe(
			error,
		);
	});

	it("[VAL-OPS-008] does not mutate workouts.get input or options on success", async () => {
		const input = { workoutId: "w1" };
		const signal = new AbortController().signal;
		const options: HevyExecutionOptions = {
			signal,
			deadline: Date.now() + 5_000,
		};
		const inputBefore = { ...input };
		const optionsBefore = { ...options };
		const adapter = createInMemoryGetAdapter({ id: "w1" });
		const operation = createWorkoutsGetOperation(adapter);

		await expect(operation.execute(input, options)).resolves.toEqual({
			workout: { id: "w1" },
		});

		expect(input).toEqual(inputBefore);
		expect(options).toEqual(optionsBefore);
		expect(options.signal).toBe(signal);
	});

	it("[VAL-OPS-008] does not mutate workouts.list input or options on rejection", async () => {
		const input = { page: 2, pageSize: 5 };
		const signal = new AbortController().signal;
		const options: HevyExecutionOptions = {
			signal,
			timeoutMs: 1_000,
		};
		const inputBefore = { ...input };
		const optionsBefore = { ...options };
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([
				{
					page: 3,
					page_count: 4,
					workouts: [],
				},
			]),
		);

		await expect(
			Effect.runPromise(operation.effect(input, options)),
		).rejects.toBeInstanceOf(PaginationMismatchError);

		expect(input).toEqual(inputBefore);
		expect(options).toEqual(optionsBefore);
		expect(options.signal).toBe(signal);
	});

	it("[VAL-OPS-008] rejects an already-aborted workouts.get without a soft outcome", async () => {
		const controller = new AbortController();
		const abortError = new Error("cancelled");
		abortError.name = "AbortError";
		controller.abort(abortError);
		const operation = createWorkoutsGetOperation(
			createAbortAwareGetAdapter(abortError),
		);

		await expect(
			operation.execute({ workoutId: "w1" }, { signal: controller.signal }),
		).rejects.toBe(abortError);
	});

	it("[VAL-OPS-008] rejects a then-aborted workouts.list without a soft outcome", async () => {
		const controller = new AbortController();
		const abortError = new Error("cancelled");
		abortError.name = "AbortError";
		const operation = createWorkoutsListOperation(
			createAbortAwareListAdapter(abortError),
		);
		const result = operation.execute(
			{ page: 2, pageSize: 5 },
			{ signal: controller.signal },
		);
		controller.abort(abortError);

		await expect(result).rejects.toBe(abortError);
	});

	it("[VAL-OPS-008] keeps sequential workouts.get outcomes request-local", async () => {
		const operation = createWorkoutsGetOperation(
			createInMemoryGetAdapter([
				notFound("/v1/workouts/missing"),
				{ id: "w2" },
			]),
		);

		await expect(operation.execute({ workoutId: "missing" })).resolves.toEqual({
			workout: null,
			expected404Outcome: "not_found",
		});
		await expect(operation.execute({ workoutId: "w2" })).resolves.toEqual({
			workout: { id: "w2" },
		});
	});

	it("[VAL-OPS-008] keeps sequential workouts.list outcomes request-local", async () => {
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([
				notFound(),
				{ page: 2, page_count: 3, workouts: [{ id: "w2" }] },
			]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).resolves.toEqual({
			items: [],
			page: 2,
			pageCount: undefined,
			expected404Outcome: "end_of_list",
		});
		await expect(operation.execute({ page: 2, pageSize: 5 })).resolves.toEqual({
			items: [{ id: "w2" }],
			page: 2,
			pageCount: 3,
		});
	});

	it("[VAL-OPS-008] keeps concurrent workouts.get outcomes request-local", async () => {
		const error = notFound("/v1/workouts/missing");
		const adapter: WorkoutsGetAdapter = {
			getWorkout(workoutId) {
				return workoutId === "missing"
					? Effect.fail(error)
					: Effect.succeed({ id: workoutId });
			},
		};
		const operation = createWorkoutsGetOperation(adapter);

		const [missing, found] = await Promise.all([
			operation.execute({ workoutId: "missing" }),
			operation.execute({ workoutId: "w2" }),
		]);

		expect(missing).toEqual({
			workout: null,
			expected404Outcome: "not_found",
		});
		expect(found).toEqual({ workout: { id: "w2" } });
	});

	it("[VAL-OPS-008] keeps concurrent workouts.list outcomes request-local", async () => {
		const error = notFound();
		const adapter: WorkoutsListAdapter = {
			getWorkouts(params) {
				if (params === undefined) {
					return Effect.fail(new Error("params are required"));
				}
				return params.page === 2
					? Effect.fail(error)
					: Effect.succeed({
							page: params.page,
							page_count: 1,
							workouts: [{ id: "w1" }],
						});
			},
		};
		const operation = createWorkoutsListOperation(adapter);

		const [endOfList, found] = await Promise.all([
			operation.execute({ page: 2, pageSize: 5 }),
			operation.execute({ page: 1, pageSize: 5 }),
		]);

		expect(endOfList).toEqual({
			items: [],
			page: 2,
			pageCount: undefined,
			expected404Outcome: "end_of_list",
		});
		expect(found).toEqual({
			items: [{ id: "w1" }],
			page: 1,
			pageCount: 1,
		});
	});
});

type WorkoutMutationCurrent = GetV1WorkoutsWorkoutid200;

interface InMemoryWorkoutMutationAdapter
	extends WorkoutsCreateAdapter, WorkoutsUpdateAdapter, WorkoutsCountAdapter {
	readonly calls: string[];
	readonly createRequests: Array<{
		readonly data: Parameters<WorkoutsCreateAdapter["createWorkout"]>[0];
		readonly options: Parameters<WorkoutsCreateAdapter["createWorkout"]>[1];
	}>;
	readonly updateRequests: Array<{
		readonly workoutId: Parameters<WorkoutsUpdateAdapter["updateWorkout"]>[0];
		readonly data: Parameters<WorkoutsUpdateAdapter["updateWorkout"]>[1];
		readonly options: Parameters<WorkoutsUpdateAdapter["updateWorkout"]>[2];
	}>;
	readonly countRequests: Array<
		Parameters<WorkoutsCountAdapter["getWorkoutCount"]>[0]
	>;
}

function createInMemoryWorkoutMutationAdapter({
	current,
	created = current,
	updated = current,
	count = { workout_count: 0 },
	getError,
}: {
	readonly current: WorkoutMutationCurrent;
	readonly created?: PostV1WorkoutsStatus201;
	readonly updated?: PutV1WorkoutsWorkoutidStatus200;
	readonly count?: GetV1WorkoutsCountStatus200;
	readonly getError?: Error;
}): InMemoryWorkoutMutationAdapter {
	const calls: string[] = [];
	const createRequests: InMemoryWorkoutMutationAdapter["createRequests"] = [];
	const updateRequests: InMemoryWorkoutMutationAdapter["updateRequests"] = [];
	const countRequests: InMemoryWorkoutMutationAdapter["countRequests"] = [];
	return {
		calls,
		createRequests,
		updateRequests,
		countRequests,
		createWorkout(data, options) {
			calls.push("create");
			createRequests.push({ data, options });
			return Effect.succeed(created);
		},
		getWorkout(workoutId, _options) {
			calls.push(`get:${workoutId}`);
			if (getError !== undefined) return Effect.fail(getError);
			return Effect.succeed(current);
		},
		updateWorkout(workoutId, data, options) {
			calls.push(`update:${workoutId}`);
			updateRequests.push({ workoutId, data, options });
			return Effect.succeed(updated);
		},
		getWorkoutCount(options) {
			countRequests.push(options);
			return Effect.succeed(count);
		},
	};
}

const currentWorkoutForMutation: WorkoutMutationCurrent = {
	id: "w1",
	title: "Original",
	description: "Keep",
	start_time: "2026-07-29T08:00:00Z",
	end_time: "2026-07-29T09:00:00Z",
	exercises: [
		{
			exercise_template_id: "bench",
			supersets_id: 4,
			notes: "Existing",
			sets: [{ type: "normal", reps: 8, weight_kg: 50, rpe: null }],
		},
	],
};

describe("workouts write operations", () => {
	it("[VAL-OPS-011] creates with the caller body through Effect without a read", async () => {
		const workout = {
			title: "New workout",
			description: null,
			start_time: "2026-07-29T08:00:00Z",
			end_time: "2026-07-29T09:00:00Z",
			exercises: [],
		};
		const created = { id: "created" };
		const adapter = createInMemoryWorkoutMutationAdapter({
			current: currentWorkoutForMutation,
			created,
		});
		const operation = createWorkoutsCreateOperation(adapter);

		await expect(
			Effect.runPromise(operation.effect({ workout })),
		).resolves.toEqual(created);

		expect(adapter.calls).toEqual(["create"]);
		expect(adapter.createRequests).toEqual([
			{ data: { workout }, options: undefined },
		]);
	});

	it("[VAL-OPS-012] updates with GET-then-PUT payload semantics", async () => {
		const adapter = createInMemoryWorkoutMutationAdapter({
			current: currentWorkoutForMutation,
			updated: { id: "w1", title: "Renamed" },
		});
		const operation = createWorkoutsUpdateOperation(adapter);
		const options: HevyExecutionOptions = {
			signal: new AbortController().signal,
			timeoutMs: 1_000,
		};

		await expect(
			Effect.runPromise(
				operation.effect(
					{
						workoutId: "w1",
						patch: { title: "Renamed", is_private: false },
					},
					options,
				),
			),
		).resolves.toEqual({ id: "w1", title: "Renamed" });

		expect(adapter.calls).toEqual(["get:w1", "update:w1"]);
		expect(adapter.updateRequests).toEqual([
			{
				workoutId: "w1",
				data: {
					workout: {
						title: "Renamed",
						description: "Keep",
						start_time: "2026-07-29T08:00:00Z",
						end_time: "2026-07-29T09:00:00Z",
						is_private: false,
						exercises: [
							{
								exercise_template_id: "bench",
								superset_id: 4,
								notes: "Existing",
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
				},
				options,
			},
		]);
	});

	it("keeps full replacement exercises on the update operation", async () => {
		const adapter = createInMemoryWorkoutMutationAdapter({
			current: currentWorkoutForMutation,
		});
		const operation = createWorkoutsUpdateOperation(adapter);

		await expect(
			Effect.runPromise(
				operation.effect({
					workoutId: "w1",
					workout: {
						title: "Replaced",
						description: null,
						start_time: "2026-07-29T08:00:00Z",
						end_time: "2026-07-29T09:00:00Z",
						is_private: true,
						exercises: [],
					},
				}),
			),
		).resolves.toEqual(currentWorkoutForMutation);
		expect(adapter.calls).toEqual(["get:w1", "update:w1"]);
		expect(adapter.updateRequests[0]?.data.workout).toMatchObject({
			title: "Replaced",
			description: null,
			is_private: true,
			exercises: [],
		});
	});

	it("inherits the fetched description in a full replacement update", async () => {
		const adapter = createInMemoryWorkoutMutationAdapter({
			current: currentWorkoutForMutation,
		});
		const operation = createWorkoutsUpdateOperation(adapter);

		await Effect.runPromise(
			operation.effect({
				workoutId: "w1",
				workout: {
					title: "Replaced",
					start_time: "2026-07-29T08:00:00Z",
					end_time: "2026-07-29T09:00:00Z",
					is_private: true,
					exercises: [],
				},
			}),
		);

		expect(adapter.updateRequests[0]?.data.workout).toHaveProperty(
			"description",
			"Keep",
		);
	});

	it("[VAL-OPS-040] merges fetched metadata into a replacement patch that omits it", async () => {
		const adapter = createInMemoryWorkoutMutationAdapter({
			current: currentWorkoutForMutation,
		});
		const operation = createWorkoutsUpdateOperation(adapter);

		await expect(
			Effect.runPromise(
				operation.effect({
					workoutId: "w1",
					workout: {
						is_private: true,
						exercises: [
							{
								exercise_template_id: "new",
								sets: [{ type: "normal", reps: 5 }],
							},
						],
					},
				}),
			),
		).resolves.toEqual(currentWorkoutForMutation);

		expect(adapter.calls).toEqual(["get:w1", "update:w1"]);
		expect(adapter.updateRequests[0]?.data.workout).toMatchObject({
			title: "Original",
			description: "Keep",
			start_time: "2026-07-29T08:00:00Z",
			end_time: "2026-07-29T09:00:00Z",
			is_private: true,
			exercises: [
				{
					exercise_template_id: "new",
					sets: [{ type: "normal", reps: 5 }],
				},
			],
		});
	});

	it("[VAL-OPS-039] sends description null on replacement when neither patch nor fetched workout has one", async () => {
		const adapter = createInMemoryWorkoutMutationAdapter({
			current: { ...currentWorkoutForMutation, description: undefined },
		});
		const operation = createWorkoutsUpdateOperation(adapter);

		await Effect.runPromise(
			operation.effect({
				workoutId: "w1",
				workout: {
					is_private: true,
					exercises: [],
				},
			}),
		);

		expect(adapter.updateRequests[0]?.data.workout).toHaveProperty(
			"description",
			null,
		);
	});

	it("[VAL-OPS-040] fails replacement update on GET 404 without issuing PUT", async () => {
		const error = new NotFoundError({
			status: 404,
			method: "GET",
			endpoint: "/v1/workouts/w1",
			expected: true,
		});
		const adapter = createInMemoryWorkoutMutationAdapter({
			current: currentWorkoutForMutation,
			getError: error,
		});
		const operation = createWorkoutsUpdateOperation(adapter);

		await expect(
			Effect.runPromise(
				operation.effect({
					workoutId: "w1",
					workout: { is_private: true, exercises: [] },
				}),
			),
		).rejects.toBe(error);
		expect(adapter.calls).toEqual(["get:w1"]);
		expect(adapter.updateRequests).toHaveLength(0);
	});

	it("[VAL-OPS-040] fails replacement update on malformed fetched timestamps", async () => {
		const adapter = createInMemoryWorkoutMutationAdapter({
			current: {
				...currentWorkoutForMutation,
				start_time: "2026-02-30T08:00:00Z",
			},
		});
		const operation = createWorkoutsUpdateOperation(adapter);

		const error = await Effect.runPromise(
			Effect.flip(
				operation.effect({
					workoutId: "w1",
					workout: { is_private: true, exercises: [] },
				}),
			),
		);

		expect(error).toBeInstanceOf(WorkoutPayloadError);
		expect(adapter.updateRequests).toHaveLength(0);
	});

	it("[VAL-OPS-012] fails update on GET 404 without issuing PUT", async () => {
		const error = new NotFoundError({
			status: 404,
			method: "GET",
			endpoint: "/v1/workouts/w1",
			expected: true,
		});
		const adapter = createInMemoryWorkoutMutationAdapter({
			current: currentWorkoutForMutation,
			getError: error,
		});
		const operation = createWorkoutsUpdateOperation(adapter);

		await expect(
			Effect.runPromise(
				operation.effect({
					workoutId: "w1",
					patch: { title: "Renamed", is_private: false },
				}),
			),
		).rejects.toBe(error);
		expect(adapter.calls).toEqual(["get:w1"]);
		expect(adapter.updateRequests).toHaveLength(0);
	});

	it("[VAL-OPS-037] reports a missing update privacy value in the Effect channel", async () => {
		const adapter = createInMemoryWorkoutMutationAdapter({
			current: currentWorkoutForMutation,
		});
		const operation = createWorkoutsUpdateOperation(adapter);

		const error = await Effect.runPromise(
			Effect.flip(
				operation.effect({
					workoutId: "w1",
					patch: { title: "Renamed" },
				}),
			),
		);

		expect(error).toMatchObject({
			_tag: "WorkoutPrivacyError",
			message: expect.stringContaining(
				"The Hevy API does not return the current privacy setting on GET",
			),
		});
		expect(adapter.calls).toEqual(["get:w1"]);
		expect(adapter.updateRequests).toHaveLength(0);
	});

	it("[VAL-OPS-013] replaces exercises with an explicit empty array and privacy", async () => {
		const adapter = createInMemoryWorkoutMutationAdapter({
			current: currentWorkoutForMutation,
		});
		const operation = createWorkoutsReplaceExercisesOperation(adapter);
		const input: WorkoutsReplaceExercisesInput = {
			workoutId: "w1",
			is_private: true,
			exercises: [],
		};

		await expect(Effect.runPromise(operation.effect(input))).resolves.toEqual(
			currentWorkoutForMutation,
		);
		expect(adapter.calls).toEqual(["get:w1", "update:w1"]);
		expect(adapter.updateRequests[0]?.data).toEqual({
			workout: {
				title: "Original",
				description: "Keep",
				start_time: "2026-07-29T08:00:00Z",
				end_time: "2026-07-29T09:00:00Z",
				is_private: true,
				exercises: [],
			},
		});
	});

	it("[VAL-OPS-013] fails exercise replacement on GET 404 without issuing PUT", async () => {
		const error = new NotFoundError({
			status: 404,
			method: "GET",
			endpoint: "/v1/workouts/w1",
			expected: true,
		});
		const adapter = createInMemoryWorkoutMutationAdapter({
			current: currentWorkoutForMutation,
			getError: error,
		});
		const operation = createWorkoutsReplaceExercisesOperation(adapter);

		await expect(
			Effect.runPromise(
				operation.effect({
					workoutId: "w1",
					is_private: false,
					exercises: [],
				}),
			),
		).rejects.toBe(error);
		expect(adapter.calls).toEqual(["get:w1"]);
		expect(adapter.updateRequests).toHaveLength(0);
	});

	it("[VAL-OPS-015] reads the numeric workout count without paginating workouts", async () => {
		const adapter = createInMemoryWorkoutMutationAdapter({
			current: currentWorkoutForMutation,
			count: { workout_count: 7 },
		});
		const operation = createWorkoutsCountOperation(adapter);

		await expect(Effect.runPromise(operation.effect())).resolves.toBe(7);
		expect(adapter.countRequests).toEqual([undefined]);
		expect(adapter.calls).toEqual([]);
	});

	it("[VAL-OPS-015] normalizes a missing workout count to zero", async () => {
		const adapter = createInMemoryWorkoutMutationAdapter({
			current: currentWorkoutForMutation,
			count: {},
		});
		const operation = createWorkoutsCountOperation(adapter);

		await expect(Effect.runPromise(operation.effect())).resolves.toBe(0);
		expect(adapter.countRequests).toEqual([undefined]);
	});
});
