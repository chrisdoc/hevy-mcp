import { NotFoundError } from "@hevy-mcp/hevy-client";
import type { GetV1WorkoutsEvents200 } from "@hevy-mcp/hevy-client/types";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
	createWorkoutsEventsOperation,
	type WorkoutsEventsAdapter,
} from "./workouts.js";

function notFound(endpoint = "/v1/workouts/events") {
	return new NotFoundError({
		status: 404,
		method: "GET",
		endpoint,
		expected: true,
	});
}

function createAdapter(responses: readonly (GetV1WorkoutsEvents200 | Error)[]) {
	let responseIndex = 0;
	const requests: Array<{
		readonly params: Parameters<WorkoutsEventsAdapter["getWorkoutEvents"]>[0];
		readonly options: Parameters<WorkoutsEventsAdapter["getWorkoutEvents"]>[1];
	}> = [];
	const adapter: WorkoutsEventsAdapter = {
		getWorkoutEvents(params, options) {
			requests.push({ params, options });
			const response = responses[responseIndex++] ?? {
				page: 1,
				page_count: 1,
				events: [],
			};
			return response instanceof Error
				? Effect.fail(response)
				: Effect.succeed(response);
		},
	};
	return { adapter, requests };
}

describe("workouts.events operation", () => {
	it("forwards since and normalizes the event envelope", async () => {
		const { adapter, requests } = createAdapter([
			{
				page: 2,
				page_count: 4,
				events: [{ type: "updated", workout: { id: "w1" } }],
			},
		]);
		const operation = createWorkoutsEventsOperation(adapter);
		const options = { timeoutMs: 1_000 };

		await expect(
			Effect.runPromise(
				operation.effect(
					{
						page: 2,
						pageSize: 10,
						since: "2026-01-01T00:00:00Z",
					},
					options,
				),
			),
		).resolves.toEqual({
			events: [{ type: "updated", workout: { id: "w1" } }],
			page: 2,
			pageCount: 4,
			since: "2026-01-01T00:00:00Z",
		});
		expect(requests).toEqual([
			{
				params: {
					page: 2,
					pageSize: 10,
					since: "2026-01-01T00:00:00Z",
				},
				options,
			},
		]);
	});

	it("uses the requested page and an empty event list when fields are omitted", async () => {
		const { adapter } = createAdapter([{} as GetV1WorkoutsEvents200]);
		const operation = createWorkoutsEventsOperation(adapter);

		await expect(
			Effect.runPromise(
				operation.effect({
					page: 2,
					pageSize: 10,
					since: "2026-01-01T00:00:00Z",
				}),
			),
		).resolves.toEqual({
			events: [],
			page: 2,
			pageCount: undefined,
			since: "2026-01-01T00:00:00Z",
		});
	});

	it("recovers only a later-page tagged collection 404", async () => {
		const operation = createWorkoutsEventsOperation(
			createAdapter([notFound()]).adapter,
		);

		await expect(
			Effect.runPromise(
				operation.effect({
					page: 2,
					pageSize: 10,
					since: "2026-01-01T00:00:00Z",
				}),
			),
		).resolves.toEqual({
			events: [],
			page: 2,
			pageCount: undefined,
			since: "2026-01-01T00:00:00Z",
			expected404Outcome: "end_of_list",
		});

		const firstPageOperation = createWorkoutsEventsOperation(
			createAdapter([notFound()]).adapter,
		);
		await expect(
			Effect.runPromise(
				firstPageOperation.effect({
					page: 1,
					pageSize: 10,
					since: "2026-01-01T00:00:00Z",
				}),
			),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("fails an events page mismatch as a tagged domain error", async () => {
		const operation = createWorkoutsEventsOperation(
			createAdapter([
				{
					page: 3,
					page_count: 4,
					events: [],
				},
			]).adapter,
		);

		await expect(
			Effect.runPromise(
				operation.effect({
					page: 2,
					pageSize: 10,
					since: "2026-01-01T00:00:00Z",
				}),
			),
		).rejects.toMatchObject({
			_tag: "PaginationMismatchError",
			requested: 2,
			received: 3,
			collection: "workoutEvents",
		});
	});
});
