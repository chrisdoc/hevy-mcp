import type { HevyClient, HevyExecutionOptions } from "@hevy-mcp/hevy-client";
import { HevyHttpError } from "@hevy-mcp/hevy-client";
import type {
	GetV1Workouts200,
	GetV1WorkoutsWorkoutid200,
} from "@hevy-mcp/hevy-client/types";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
	createWorkoutsGetOperation,
	createWorkoutsListOperation,
	type WorkoutsGetAdapter,
	type WorkoutsListAdapter,
} from "./workouts.js";
import { PaginationMismatchError } from "./operation-errors.js";

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

	it("[VAL-OPS-005] normalizes a missing workout response to null without a soft-404 outcome", async () => {
		const operation = createWorkoutsGetOperation(createInMemoryGetAdapter());

		await expect(operation.execute({ workoutId: "missing" })).resolves.toEqual({
			workout: null,
		});
	});

	it("[VAL-OPS-009] returns not_found only for the canonical workout resource 404", async () => {
		const operation = createWorkoutsGetOperation(
			createInMemoryGetAdapter(notFound("/v1/workouts/w1")),
		);

		await expect(operation.execute({ workoutId: "w1" })).resolves.toEqual({
			workout: null,
			expected404Outcome: "not_found",
		});
	});

	it("[VAL-OPS-015] rejects an unrelated GET 404 with the original error", async () => {
		const error = notFound("/v1/routines/r1");
		const operation = createWorkoutsGetOperation(
			createInMemoryGetAdapter(error),
		);

		await expect(operation.execute({ workoutId: "w1" })).rejects.toBe(error);
	});

	it("[VAL-OPS-019] rejects a mutation 404 with the original error", async () => {
		const error = notFound("/v1/workouts/w1", "POST");
		const operation = createWorkoutsGetOperation(
			createInMemoryGetAdapter(error),
		);

		await expect(operation.execute({ workoutId: "w1" })).rejects.toBe(error);
	});

	it("[VAL-OPS-028] preserves non-404 error identity for workouts.get", async () => {
		const error = httpError(503, "GET", "/v1/workouts/w1", "upstream failure");
		const operation = createWorkoutsGetOperation(
			createInMemoryGetAdapter(error),
		);

		await expect(operation.execute({ workoutId: "w1" })).rejects.toBe(error);
	});

	it("[VAL-OPS-029] rejects a collection-path GET 404 for workouts.get", async () => {
		const error = notFound("/v1/workouts");
		const operation = createWorkoutsGetOperation(
			createInMemoryGetAdapter(error),
		);

		await expect(operation.execute({ workoutId: "w1" })).rejects.toBe(error);
	});

	it("[VAL-OPS-025] omits the options argument when workouts.get options are absent", async () => {
		const adapter = createInMemoryGetAdapter({ id: "w1" });
		const operation = createWorkoutsGetOperation(adapter);

		await expect(operation.execute({ workoutId: "w1" })).resolves.toEqual({
			workout: { id: "w1" },
		});
		expect(adapter.argumentCounts).toEqual([1]);
	});
});

describe("workouts.list operation", () => {
	it("[VAL-OPS-003] succeeds with the requested page and preserves the read descriptor", async () => {
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

	it("[VAL-OPS-011] treats a later-page collection 404 as the end of the list", async () => {
		const adapter = createInMemoryAdapter([notFound()]);
		const operation = createWorkoutsListOperation(adapter);

		await expect(operation.execute({ page: 3, pageSize: 5 })).resolves.toEqual({
			items: [],
			page: 3,
			pageCount: undefined,
			expected404Outcome: "end_of_list",
		});
	});

	it("[VAL-OPS-013] rejects a first-page collection 404", async () => {
		const error = notFound();
		const firstPageAdapter = createInMemoryAdapter([error]);
		const firstPageOperation = createWorkoutsListOperation(firstPageAdapter);
		await expect(
			firstPageOperation.execute({ page: 1, pageSize: 5 }),
		).rejects.toBe(error);
	});

	it("[VAL-OPS-017] rejects an unrelated collection 404 with the original error", async () => {
		const error = notFound("/v1/routines");
		const unrelatedAdapter = createInMemoryAdapter([error]);
		const unrelatedOperation = createWorkoutsListOperation(unrelatedAdapter);
		await expect(
			unrelatedOperation.execute({ page: 2, pageSize: 5 }),
		).rejects.toBe(error);
	});

	it("[VAL-OPS-021] rejects a mutation 404 for workouts.list with the original error", async () => {
		const error = notFound("/v1/workouts", "POST");
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([error]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).rejects.toBe(
			error,
		);
	});

	it("[VAL-OPS-028] preserves non-404 error identity for workouts.list", async () => {
		const error = new Error("network failure");
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([error]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).rejects.toBe(
			error,
		);
	});

	it("[VAL-OPS-030] rejects a member-path GET 404 for workouts.list", async () => {
		const error = notFound("/v1/workouts/w1");
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([error]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).rejects.toBe(
			error,
		);
	});

	it("[VAL-OPS-031] rejects a same-prefix sibling collection 404 for workouts.list", async () => {
		const error = notFound("/v1/workouts/count");
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([error]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).rejects.toBe(
			error,
		);
	});

	it("[VAL-OPS-032] keeps an empty 200 workouts list distinct from end_of_list", async () => {
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

	it("[VAL-OPS-007] normalizes an omitted workouts field to an empty list without a soft-404 outcome", async () => {
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([{ page: 2, page_count: 4 }]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).resolves.toEqual({
			items: [],
			page: 2,
			pageCount: 4,
		});
	});

	it("[VAL-OPS-033] allows workouts list responses to omit page_count", async () => {
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([{ page: 2, workouts: [{ id: "w1" }] }]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).resolves.toEqual({
			items: [{ id: "w1" }],
			page: 2,
			pageCount: undefined,
		});
	});

	it("[VAL-OPS-026] uses the requested page when workouts response.page is omitted", async () => {
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([{ page_count: 4, workouts: [{ id: "w1" }] }]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).resolves.toEqual({
			items: [{ id: "w1" }],
			page: 2,
			pageCount: 4,
		});
	});

	it("[VAL-OPS-025] omits the options argument when workouts.list options are absent", async () => {
		const adapter = createInMemoryAdapter([{ page: 1, workouts: [] }]);
		const operation = createWorkoutsListOperation(adapter);

		await expect(operation.execute({ page: 1, pageSize: 5 })).resolves.toEqual({
			items: [],
			page: 1,
			pageCount: undefined,
		});
		expect(adapter.argumentCounts).toEqual([1]);
	});

	it("[VAL-OPS-023] rejects when response page differs from requested page", async () => {
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

	it("[VAL-OPS-027] exposes workouts.get as a native Promise, not an Effect", async () => {
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

	it("[VAL-OPS-027] exposes workouts.list as a native Promise, not an Effect", async () => {
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

	it("[VAL-OPS-028] preserves a plain network error for workouts.get", async () => {
		const error = new Error("network failure");
		const operation = createWorkoutsGetOperation(
			createInMemoryGetAdapter(error),
		);

		await expect(operation.execute({ workoutId: "w1" })).rejects.toBe(error);
	});

	it("[VAL-OPS-028] preserves a non-404 HTTP error for workouts.list", async () => {
		const error = httpError(429, "GET", "/v1/workouts", "rate limited");
		const operation = createWorkoutsListOperation(
			createInMemoryAdapter([error]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).rejects.toBe(
			error,
		);
	});

	it("[VAL-OPS-034] does not mutate workouts.get input or options on success", async () => {
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

	it("[VAL-OPS-034] does not mutate workouts.list input or options on rejection", async () => {
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

	it("[VAL-OPS-036] rejects an already-aborted workouts.get without a soft outcome", async () => {
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

	it("[VAL-OPS-036] rejects a then-aborted workouts.list without a soft outcome", async () => {
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

	it("[VAL-OPS-035] keeps sequential workouts.get outcomes request-local", async () => {
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

	it("[VAL-OPS-035] keeps sequential workouts.list outcomes request-local", async () => {
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

	it("[VAL-OPS-037] keeps concurrent workouts.get outcomes request-local", async () => {
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

	it("[VAL-OPS-037] keeps concurrent workouts.list outcomes request-local", async () => {
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
