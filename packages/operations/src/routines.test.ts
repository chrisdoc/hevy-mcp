import type { HevyClient, HevyExecutionOptions } from "@hevy-mcp/hevy-client";
import { HevyHttpError } from "@hevy-mcp/hevy-client";
import type {
	GetV1Routines200,
	GetV1RoutinesRoutineid200,
} from "@hevy-mcp/hevy-client/types";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
	createRoutinesGetOperation,
	createRoutinesListOperation,
	type RoutinesGetAdapter,
	type RoutinesListAdapter,
} from "./routines.js";
import { PaginationMismatchError } from "./operation-errors.js";

interface InMemoryRoutinesAdapter extends RoutinesListAdapter {
	readonly requests: Array<{
		readonly params: Parameters<HevyClient["getRoutines"]>[0];
		readonly options: Parameters<HevyClient["getRoutines"]>[1];
	}>;
	readonly argumentCounts: number[];
}

function createInMemoryAdapter(
	responses: readonly (GetV1Routines200 | Error)[],
): InMemoryRoutinesAdapter {
	let responseIndex = 0;
	const requests: InMemoryRoutinesAdapter["requests"] = [];
	const argumentCounts: InMemoryRoutinesAdapter["argumentCounts"] = [];
	return {
		requests,
		argumentCounts,
		getRoutines(params, options) {
			argumentCounts.push(arguments.length);
			requests.push({ params, options });
			const response = responses[responseIndex++] ?? { routines: [] };
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

function notFound(endpoint = "/v1/routines", method = "GET") {
	return httpError(404, method, endpoint, "not found");
}

interface InMemoryRoutinesGetAdapter extends RoutinesGetAdapter {
	readonly requests: Array<{
		readonly routineId: Parameters<HevyClient["getRoutineById"]>[0];
		readonly options: Parameters<HevyClient["getRoutineById"]>[1];
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
	responses:
		| GetV1RoutinesRoutineid200
		| Error
		| readonly (GetV1RoutinesRoutineid200 | Error | undefined)[],
): InMemoryRoutinesGetAdapter {
	const requests: InMemoryRoutinesGetAdapter["requests"] = [];
	const argumentCounts: InMemoryRoutinesGetAdapter["argumentCounts"] = [];
	const responseSequence = Array.isArray(responses) ? responses : [responses];
	let responseIndex = 0;
	return {
		requests,
		argumentCounts,
		getRoutineById(routineId, options) {
			argumentCounts.push(arguments.length);
			requests.push({ routineId, options });
			const response = responseSequence[responseIndex++];
			if (response instanceof Error) return Effect.fail(response);
			return Effect.succeed(response ?? {});
		},
	};
}

function createAbortAwareGetAdapter(error: Error): InMemoryRoutinesGetAdapter {
	const requests: InMemoryRoutinesGetAdapter["requests"] = [];
	const argumentCounts: InMemoryRoutinesGetAdapter["argumentCounts"] = [];
	return {
		requests,
		argumentCounts,
		getRoutineById(routineId, options) {
			argumentCounts.push(arguments.length);
			requests.push({ routineId, options });
			return abortable<GetV1RoutinesRoutineid200>(options, error);
		},
	};
}

function createAbortAwareListAdapter(error: Error): InMemoryRoutinesAdapter {
	const requests: InMemoryRoutinesAdapter["requests"] = [];
	const argumentCounts: InMemoryRoutinesAdapter["argumentCounts"] = [];
	return {
		requests,
		argumentCounts,
		getRoutines(params, options) {
			argumentCounts.push(arguments.length);
			requests.push({ params, options });
			return abortable<GetV1Routines200>(options, error);
		},
	};
}

describe("routines.get operation", () => {
	it("[VAL-OPS-002] succeeds with the routine entity and preserves the read descriptor", async () => {
		const adapter = createInMemoryGetAdapter({
			routine: { id: "r1", title: "Push", exercises: [] },
		});
		const operation = createRoutinesGetOperation(adapter);
		const signal = new AbortController().signal;
		const options: HevyExecutionOptions = {
			signal,
			deadline: Date.now() + 5_000,
		};

		await expect(
			operation.execute({ routineId: "r1" }, options),
		).resolves.toEqual({
			routine: { id: "r1", title: "Push", exercises: [] },
		});
		expect(operation.descriptor).toEqual({
			id: "routines.get",
			safety: "read",
		});
		expect(adapter.requests).toEqual([{ routineId: "r1", options }]);
		expect(adapter.requests[0]?.options).toBe(options);
	});

	it("[VAL-OPS-006] normalizes a missing routine field to null without a soft-404 outcome", async () => {
		const operation = createRoutinesGetOperation(createInMemoryGetAdapter({}));

		await expect(operation.execute({ routineId: "missing" })).resolves.toEqual({
			routine: null,
		});
	});

	it("[VAL-OPS-010] returns not_found only for the canonical routine resource 404", async () => {
		const operation = createRoutinesGetOperation(
			createInMemoryGetAdapter(notFound("/v1/routines/r1")),
		);

		await expect(operation.execute({ routineId: "r1" })).resolves.toEqual({
			routine: null,
			expected404Outcome: "not_found",
		});
	});

	it("[VAL-OPS-016] rejects an unrelated GET 404 with the original error", async () => {
		const error = notFound("/v1/workouts/w1");
		const operation = createRoutinesGetOperation(
			createInMemoryGetAdapter(error),
		);

		await expect(operation.execute({ routineId: "r1" })).rejects.toBe(error);
	});

	it("[VAL-OPS-020] rejects a mutation 404 with the original error", async () => {
		const error = notFound("/v1/routines/r1", "POST");
		const operation = createRoutinesGetOperation(
			createInMemoryGetAdapter(error),
		);

		await expect(operation.execute({ routineId: "r1" })).rejects.toBe(error);
	});

	it("[VAL-OPS-028] preserves non-404 error identity for routines.get", async () => {
		const error = httpError(401, "GET", "/v1/routines/r1", "unauthorized");
		const operation = createRoutinesGetOperation(
			createInMemoryGetAdapter(error),
		);

		await expect(operation.execute({ routineId: "r1" })).rejects.toBe(error);
	});

	it("[VAL-OPS-029] rejects a collection-path GET 404 for routines.get", async () => {
		const error = notFound("/v1/routines");
		const operation = createRoutinesGetOperation(
			createInMemoryGetAdapter(error),
		);

		await expect(operation.execute({ routineId: "r1" })).rejects.toBe(error);
	});

	it("[VAL-OPS-025] omits the options argument when routines.get options are absent", async () => {
		const adapter = createInMemoryGetAdapter({ routine: { id: "r1" } });
		const operation = createRoutinesGetOperation(adapter);

		await expect(operation.execute({ routineId: "r1" })).resolves.toEqual({
			routine: { id: "r1" },
		});
		expect(adapter.argumentCounts).toEqual([1]);
	});
});

describe("routines.list operation", () => {
	it("[VAL-OPS-004] succeeds with the requested page and preserves the read descriptor", async () => {
		const adapter = createInMemoryAdapter([
			{
				page: 2,
				page_count: 4,
				routines: [{ id: "r1", title: "Push", exercises: [] }],
			},
		]);
		const operation = createRoutinesListOperation(adapter);
		const signal = new AbortController().signal;
		const options: HevyExecutionOptions = {
			signal,
			deadline: Date.now() + 5_000,
		};

		await expect(
			operation.execute({ page: 2, pageSize: 10 }, options),
		).resolves.toEqual({
			items: [{ id: "r1", title: "Push", exercises: [] }],
			page: 2,
			pageCount: 4,
		});
		expect(operation.descriptor).toEqual({
			id: "routines.list",
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

	it("[VAL-OPS-008] normalizes a missing routines field to an empty list without a soft-404 outcome", async () => {
		const operation = createRoutinesListOperation(
			createInMemoryAdapter([{ page: 1, page_count: 1 }]),
		);

		await expect(operation.execute({ page: 1, pageSize: 5 })).resolves.toEqual({
			items: [],
			page: 1,
			pageCount: 1,
		});
	});

	it("[VAL-OPS-012] treats a later-page collection 404 as the end of the list", async () => {
		const operation = createRoutinesListOperation(
			createInMemoryAdapter([notFound()]),
		);

		await expect(operation.execute({ page: 3, pageSize: 5 })).resolves.toEqual({
			items: [],
			page: 3,
			pageCount: undefined,
			expected404Outcome: "end_of_list",
		});
	});

	it("[VAL-OPS-014] rejects a first-page collection 404", async () => {
		const error = notFound();
		const firstPageOperation = createRoutinesListOperation(
			createInMemoryAdapter([error]),
		);
		await expect(
			firstPageOperation.execute({ page: 1, pageSize: 5 }),
		).rejects.toBe(error);
	});

	it("[VAL-OPS-018] rejects an unrelated collection 404 with the original error", async () => {
		const error = notFound("/v1/workouts");
		const unrelatedOperation = createRoutinesListOperation(
			createInMemoryAdapter([error]),
		);
		await expect(
			unrelatedOperation.execute({ page: 2, pageSize: 5 }),
		).rejects.toBe(error);
	});

	it("[VAL-OPS-024] rejects when response page differs from requested page", async () => {
		const operation = createRoutinesListOperation(
			createInMemoryAdapter([
				{
					page: 3,
					page_count: 5,
					routines: [],
				},
			]),
		);

		await expect(
			Effect.runPromise(operation.effect({ page: 2, pageSize: 10 })),
		).rejects.toMatchObject({
			_tag: "PaginationMismatchError",
			requested: 2,
			received: 3,
			collection: "routines",
		});
	});

	it("[VAL-OPS-022] rejects a mutation 404 for routines.list with the original error", async () => {
		const error = notFound("/v1/routines", "POST");
		const operation = createRoutinesListOperation(
			createInMemoryAdapter([error]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).rejects.toBe(
			error,
		);
	});

	it("[VAL-OPS-030] rejects a member-path GET 404 for routines.list", async () => {
		const error = notFound("/v1/routines/r1");
		const operation = createRoutinesListOperation(
			createInMemoryAdapter([error]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).rejects.toBe(
			error,
		);
	});

	it("[VAL-OPS-031] rejects a same-prefix sibling collection 404 for routines.list", async () => {
		const error = notFound("/v1/routines/count");
		const operation = createRoutinesListOperation(
			createInMemoryAdapter([error]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).rejects.toBe(
			error,
		);
	});

	it("[VAL-OPS-032] keeps an empty 200 routines list distinct from end_of_list", async () => {
		const operation = createRoutinesListOperation(
			createInMemoryAdapter([
				{
					page: 2,
					page_count: 4,
					routines: [],
				},
			]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).resolves.toEqual({
			items: [],
			page: 2,
			pageCount: 4,
		});
	});

	it("[VAL-OPS-033] allows routines list responses to omit page_count", async () => {
		const operation = createRoutinesListOperation(
			createInMemoryAdapter([{ page: 2, routines: [{ id: "r1" }] }]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).resolves.toEqual({
			items: [{ id: "r1" }],
			page: 2,
			pageCount: undefined,
		});
	});

	it("[VAL-OPS-026] uses the requested page when routines response.page is omitted", async () => {
		const operation = createRoutinesListOperation(
			createInMemoryAdapter([{ page_count: 4, routines: [{ id: "r1" }] }]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).resolves.toEqual({
			items: [{ id: "r1" }],
			page: 2,
			pageCount: 4,
		});
	});

	it("[VAL-OPS-025] omits the options argument when routines.list options are absent", async () => {
		const adapter = createInMemoryAdapter([{ page: 1, routines: [] }]);
		const operation = createRoutinesListOperation(adapter);

		await expect(operation.execute({ page: 1, pageSize: 5 })).resolves.toEqual({
			items: [],
			page: 1,
			pageCount: undefined,
		});
		expect(adapter.argumentCounts).toEqual([1]);
	});

	it("[VAL-OPS-027] exposes routines.get as a native Promise, not an Effect", async () => {
		const operation = createRoutinesGetOperation(
			createInMemoryGetAdapter({ routine: { id: "r1" } }),
		);

		const result = operation.execute({ routineId: "r1" });

		expect(result).toBeInstanceOf(Promise);
		expect("then" in result).toBe(true);
		expect("pipe" in result).toBe(false);
		expect("_tag" in result).toBe(false);
		await expect(result).resolves.toEqual({ routine: { id: "r1" } });
	});

	it("[VAL-OPS-027] exposes routines.list as a native Promise, not an Effect", async () => {
		const operation = createRoutinesListOperation(
			createInMemoryAdapter([{ page: 1, routines: [] }]),
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

	it("[VAL-OPS-028] preserves a plain network error for routines.get", async () => {
		const error = new Error("network failure");
		const operation = createRoutinesGetOperation(
			createInMemoryGetAdapter(error),
		);

		await expect(operation.execute({ routineId: "r1" })).rejects.toBe(error);
	});

	it("[VAL-OPS-028] preserves a non-404 HTTP error for routines.list", async () => {
		const error = httpError(503, "GET", "/v1/routines", "upstream failure");
		const operation = createRoutinesListOperation(
			createInMemoryAdapter([error]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).rejects.toBe(
			error,
		);
	});

	it("[VAL-OPS-034] does not mutate routines.get input or options on success", async () => {
		const input = { routineId: "r1" };
		const signal = new AbortController().signal;
		const options: HevyExecutionOptions = {
			signal,
			deadline: Date.now() + 5_000,
		};
		const inputBefore = { ...input };
		const optionsBefore = { ...options };
		const adapter = createInMemoryGetAdapter({
			routine: { id: "r1" },
		});
		const operation = createRoutinesGetOperation(adapter);

		await expect(operation.execute(input, options)).resolves.toEqual({
			routine: { id: "r1" },
		});

		expect(input).toEqual(inputBefore);
		expect(options).toEqual(optionsBefore);
		expect(options.signal).toBe(signal);
	});

	it("[VAL-OPS-034] does not mutate routines.list input or options on rejection", async () => {
		const input = { page: 2, pageSize: 5 };
		const signal = new AbortController().signal;
		const options: HevyExecutionOptions = {
			signal,
			timeoutMs: 1_000,
		};
		const inputBefore = { ...input };
		const optionsBefore = { ...options };
		const operation = createRoutinesListOperation(
			createInMemoryAdapter([
				{
					page: 3,
					page_count: 4,
					routines: [],
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

	it("[VAL-OPS-036] rejects an already-aborted routines.get without a soft outcome", async () => {
		const controller = new AbortController();
		const abortError = new Error("cancelled");
		abortError.name = "AbortError";
		controller.abort(abortError);
		const operation = createRoutinesGetOperation(
			createAbortAwareGetAdapter(abortError),
		);

		await expect(
			operation.execute({ routineId: "r1" }, { signal: controller.signal }),
		).rejects.toBe(abortError);
	});

	it("[VAL-OPS-036] rejects a then-aborted routines.list without a soft outcome", async () => {
		const controller = new AbortController();
		const abortError = new Error("cancelled");
		abortError.name = "AbortError";
		const operation = createRoutinesListOperation(
			createAbortAwareListAdapter(abortError),
		);
		const result = operation.execute(
			{ page: 2, pageSize: 5 },
			{ signal: controller.signal },
		);
		controller.abort(abortError);

		await expect(result).rejects.toBe(abortError);
	});

	it("[VAL-OPS-035] keeps sequential routines.get outcomes request-local", async () => {
		const operation = createRoutinesGetOperation(
			createInMemoryGetAdapter([
				notFound("/v1/routines/missing"),
				{ routine: { id: "r2" } },
			]),
		);

		await expect(operation.execute({ routineId: "missing" })).resolves.toEqual({
			routine: null,
			expected404Outcome: "not_found",
		});
		await expect(operation.execute({ routineId: "r2" })).resolves.toEqual({
			routine: { id: "r2" },
		});
	});

	it("[VAL-OPS-035] keeps sequential routines.list outcomes request-local", async () => {
		const operation = createRoutinesListOperation(
			createInMemoryAdapter([
				notFound(),
				{ page: 2, page_count: 3, routines: [{ id: "r2" }] },
			]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).resolves.toEqual({
			items: [],
			page: 2,
			pageCount: undefined,
			expected404Outcome: "end_of_list",
		});
		await expect(operation.execute({ page: 2, pageSize: 5 })).resolves.toEqual({
			items: [{ id: "r2" }],
			page: 2,
			pageCount: 3,
		});
	});

	it("[VAL-OPS-037] keeps concurrent routines.get outcomes request-local", async () => {
		const error = notFound("/v1/routines/missing");
		const adapter: RoutinesGetAdapter = {
			getRoutineById(routineId) {
				return routineId === "missing"
					? Effect.fail(error)
					: Effect.succeed({ routine: { id: routineId } });
			},
		};
		const operation = createRoutinesGetOperation(adapter);

		const [missing, found] = await Promise.all([
			operation.execute({ routineId: "missing" }),
			operation.execute({ routineId: "r2" }),
		]);

		expect(missing).toEqual({
			routine: null,
			expected404Outcome: "not_found",
		});
		expect(found).toEqual({ routine: { id: "r2" } });
	});

	it("[VAL-OPS-037] keeps concurrent routines.list outcomes request-local", async () => {
		const error = notFound();
		const adapter: RoutinesListAdapter = {
			getRoutines(params) {
				if (params === undefined) {
					return Effect.fail(new Error("params are required"));
				}
				return params.page === 2
					? Effect.fail(error)
					: Effect.succeed({
							page: params.page,
							page_count: 1,
							routines: [{ id: "r1" }],
						});
			},
		};
		const operation = createRoutinesListOperation(adapter);

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
			items: [{ id: "r1" }],
			page: 1,
			pageCount: 1,
		});
	});
});
