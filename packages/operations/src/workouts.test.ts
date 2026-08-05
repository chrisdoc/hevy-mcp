import type { HevyClient, HevyExecutionOptions } from "@hevy-mcp/hevy-client";
import { HevyHttpError } from "@hevy-mcp/hevy-client";
import type { GetV1Workouts200 } from "@hevy-mcp/hevy-client/types";
import { describe, expect, it } from "vitest";
import {
	createWorkoutsListOperation,
	type WorkoutsListAdapter,
} from "./workouts.js";

interface InMemoryWorkoutsAdapter extends WorkoutsListAdapter {
	readonly requests: Array<{
		readonly params: Parameters<HevyClient["getWorkouts"]>[0];
		readonly options: Parameters<HevyClient["getWorkouts"]>[1];
	}>;
}

function createInMemoryAdapter(
	responses: readonly (GetV1Workouts200 | Error)[],
): InMemoryWorkoutsAdapter {
	let responseIndex = 0;
	const requests: InMemoryWorkoutsAdapter["requests"] = [];
	return {
		requests,
		async getWorkouts(params, options) {
			requests.push({ params, options });
			const response = responses[responseIndex++] ?? { workouts: [] };
			if (response instanceof Error) throw response;
			return response;
		},
	};
}

function notFound(endpoint = "/v1/workouts") {
	return new HevyHttpError("not found", {
		status: 404,
		method: "GET",
		endpoint,
		outcome: "expected",
	});
}

describe("workouts.list operation", () => {
	it("describes a read and normalizes the curated client page", async () => {
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
	});

	it("treats a later-page 404 as the end of the list", async () => {
		const adapter = createInMemoryAdapter([notFound()]);
		const operation = createWorkoutsListOperation(adapter);

		await expect(operation.execute({ page: 3, pageSize: 5 })).resolves.toEqual({
			items: [],
			page: 3,
			pageCount: undefined,
			expected404Outcome: "end_of_list",
		});
	});

	it("does not hide a first-page or unrelated 404", async () => {
		const firstPageAdapter = createInMemoryAdapter([notFound()]);
		const firstPageOperation = createWorkoutsListOperation(firstPageAdapter);
		await expect(
			firstPageOperation.execute({ page: 1, pageSize: 5 }),
		).rejects.toBeInstanceOf(HevyHttpError);

		const unrelatedAdapter = createInMemoryAdapter([notFound("/v1/routines")]);
		const unrelatedOperation = createWorkoutsListOperation(unrelatedAdapter);
		await expect(
			unrelatedOperation.execute({ page: 2, pageSize: 5 }),
		).rejects.toBeInstanceOf(HevyHttpError);
	});

	it("rejects when response page differs from requested page", async () => {
		const adapter = createInMemoryAdapter([
			{
				page: 3,
				page_count: 5,
				workouts: [{ id: "w1" }],
			},
		]);
		const operation = createWorkoutsListOperation(adapter);

		await expect(operation.execute({ page: 2, pageSize: 10 })).rejects.toThrow(
			"Workouts page mismatch: requested page 2 but received page 3",
		);
	});
});
