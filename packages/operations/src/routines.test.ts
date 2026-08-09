import type { HevyClient, HevyExecutionOptions } from "@hevy-mcp/hevy-client";
import { HevyHttpError } from "@hevy-mcp/hevy-client";
import type {
	GetV1Routines200,
	GetV1RoutinesRoutineid200,
} from "@hevy-mcp/hevy-client/types";
import { describe, expect, it } from "vitest";
import {
	createRoutinesGetOperation,
	createRoutinesListOperation,
	type RoutinesGetAdapter,
	type RoutinesListAdapter,
} from "./routines.js";

interface InMemoryRoutinesAdapter extends RoutinesListAdapter {
	readonly requests: Array<{
		readonly params: Parameters<HevyClient["getRoutines"]>[0];
		readonly options: Parameters<HevyClient["getRoutines"]>[1];
	}>;
}

function createInMemoryAdapter(
	responses: readonly (GetV1Routines200 | Error)[],
): InMemoryRoutinesAdapter {
	let responseIndex = 0;
	const requests: InMemoryRoutinesAdapter["requests"] = [];
	return {
		requests,
		getRoutines(params, options) {
			requests.push({ params, options });
			const response = responses[responseIndex++] ?? { routines: [] };
			if (response instanceof Error) return Promise.reject(response);
			return Promise.resolve(response);
		},
	};
}

function notFound(endpoint = "/v1/routines") {
	return new HevyHttpError("not found", {
		status: 404,
		method: "GET",
		endpoint,
		outcome: "expected",
	});
}

interface InMemoryRoutinesGetAdapter extends RoutinesGetAdapter {
	readonly requests: Array<{
		readonly routineId: Parameters<HevyClient["getRoutineById"]>[0];
		readonly options: Parameters<HevyClient["getRoutineById"]>[1];
	}>;
}

function createInMemoryGetAdapter(
	response: GetV1RoutinesRoutineid200 | Error,
): InMemoryRoutinesGetAdapter {
	const requests: InMemoryRoutinesGetAdapter["requests"] = [];
	return {
		requests,
		getRoutineById(routineId, options) {
			requests.push({ routineId, options });
			if (response instanceof Error) return Promise.reject(response);
			return Promise.resolve(response);
		},
	};
}

describe("routines.get operation", () => {
	it("maps the routine ID, propagates execution options, and normalizes the response", async () => {
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
	});

	it("normalizes a missing routine field to null", async () => {
		const operation = createRoutinesGetOperation(createInMemoryGetAdapter({}));

		await expect(operation.execute({ routineId: "missing" })).resolves.toEqual({
			routine: null,
		});
	});

	it("returns not_found only for the canonical routine resource 404", async () => {
		const operation = createRoutinesGetOperation(
			createInMemoryGetAdapter(notFound("/v1/routines/r1")),
		);

		await expect(operation.execute({ routineId: "r1" })).resolves.toEqual({
			routine: null,
			expected404Outcome: "not_found",
		});

		const unrelatedOperation = createRoutinesGetOperation(
			createInMemoryGetAdapter(notFound("/v1/workouts/w1")),
		);
		await expect(
			unrelatedOperation.execute({ routineId: "r1" }),
		).rejects.toBeInstanceOf(HevyHttpError);
	});
});

describe("routines.list operation", () => {
	it("describes a read and normalizes the curated client page", async () => {
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
	});

	it("normalizes a missing routines field to an empty list", async () => {
		const operation = createRoutinesListOperation(
			createInMemoryAdapter([{ page: 1, page_count: 1 }]),
		);

		await expect(operation.execute({ page: 1, pageSize: 5 })).resolves.toEqual({
			items: [],
			page: 1,
			pageCount: 1,
		});
	});

	it("treats a later-page 404 as the end of the list", async () => {
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

	it("does not hide a first-page or unrelated 404", async () => {
		const firstPageOperation = createRoutinesListOperation(
			createInMemoryAdapter([notFound()]),
		);
		await expect(
			firstPageOperation.execute({ page: 1, pageSize: 5 }),
		).rejects.toBeInstanceOf(HevyHttpError);

		const unrelatedOperation = createRoutinesListOperation(
			createInMemoryAdapter([notFound("/v1/workouts")]),
		);
		await expect(
			unrelatedOperation.execute({ page: 2, pageSize: 5 }),
		).rejects.toBeInstanceOf(HevyHttpError);
	});

	it("rejects when response page differs from requested page", async () => {
		const operation = createRoutinesListOperation(
			createInMemoryAdapter([
				{
					page: 3,
					page_count: 5,
					routines: [],
				},
			]),
		);

		await expect(operation.execute({ page: 2, pageSize: 10 })).rejects.toThrow(
			"Routines page mismatch: requested page 2 but received page 3",
		);
	});

	it("propagates mutation errors", async () => {
		const error = new HevyHttpError("not found", {
			status: 404,
			method: "POST",
			endpoint: "/v1/routines",
		});
		const operation = createRoutinesListOperation(
			createInMemoryAdapter([error]),
		);

		await expect(operation.execute({ page: 2, pageSize: 5 })).rejects.toBe(
			error,
		);
	});
});
