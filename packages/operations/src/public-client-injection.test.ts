import { describe, expect, it, vi } from "vitest";

import { createHevyClient } from "@hevy-mcp/hevy-client";
import { Effect } from "effect";
import { createOperations } from "./index.js";

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { readonly [key: string]: JsonValue };

function response(data: JsonObject, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("createOperations public client injection", () => {
	it("[VAL-OPS-038] executes all workout and routine reads from createHevyClient", async () => {
		const fetchMock = vi.fn((input: RequestInfo | URL) => {
			const requestUrl =
				input instanceof Request
					? input.url
					: input instanceof URL
						? input.href
						: input;
			const url = new URL(requestUrl);

			switch (url.pathname) {
				case "/v1/workouts":
					return Promise.resolve(
						response({
							page: 1,
							page_count: 1,
							workouts: [{ id: "workout-1" }],
						}),
					);
				case "/v1/workouts/workout-1":
					return Promise.resolve(response({ id: "workout-1" }));
				case "/v1/routines":
					return Promise.resolve(
						response({
							page: 1,
							page_count: 1,
							routines: [{ id: "routine-1" }],
						}),
					);
				case "/v1/routines/routine-1":
					return Promise.resolve(response({ routine: { id: "routine-1" } }));
				default:
					return Promise.resolve(response({}, 404));
			}
		});
		const operations = createOperations(
			createHevyClient({
				apiKey: "test-key",
				baseUrl: "https://example.test",
				fetch: fetchMock,
				maxGetRetries: 0,
			}),
		);

		await expect(
			Effect.runPromise(
				operations.workouts.list.effect({ page: 1, pageSize: 5 }),
			),
		).resolves.toEqual({
			items: [{ id: "workout-1" }],
			page: 1,
			pageCount: 1,
		});
		await expect(
			Effect.runPromise(
				operations.workouts.get.effect({ workoutId: "workout-1" }),
			),
		).resolves.toEqual({
			workout: { id: "workout-1" },
		});
		await expect(
			Effect.runPromise(
				operations.routines.list.effect({ page: 1, pageSize: 5 }),
			),
		).resolves.toEqual({
			items: [{ id: "routine-1" }],
			page: 1,
			pageCount: 1,
		});
		await expect(
			Effect.runPromise(
				operations.routines.get.effect({ routineId: "routine-1" }),
			),
		).resolves.toEqual({
			routine: { id: "routine-1" },
		});

		expect(fetchMock).toHaveBeenCalledTimes(4);
	});

	it("rejects a Promise-only structural mock with a clear seam error", async () => {
		const client = {
			getWorkouts: vi.fn().mockResolvedValue({ workouts: [] }),
			getWorkout: vi.fn().mockResolvedValue({ id: "workout-1" }),
			getRoutines: vi.fn().mockResolvedValue({ routines: [] }),
			getRoutineById: vi.fn().mockResolvedValue({
				routine: { id: "routine-1" },
			}),
		};
		const operations = createOperations(client as never);

		await expect(
			Effect.runPromise(
				operations.workouts.get.effect({ workoutId: "workout-1" }),
			),
		).rejects.toThrow("internal request Effect seam");
	});

	it("rejects a malformed requestEffect property with the same clear error", async () => {
		const operations = createOperations({
			getWorkouts: vi.fn(),
			getWorkout: vi.fn(),
			getRoutines: vi.fn(),
			getRoutineById: vi.fn(),
			requestEffect: null,
		} as never);

		await expect(
			Effect.runPromise(
				operations.workouts.get.effect({ workoutId: "workout-1" }),
			),
		).rejects.toThrow("internal request Effect seam");
	});
});
