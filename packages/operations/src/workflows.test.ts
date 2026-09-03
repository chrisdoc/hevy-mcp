import { NotFoundError } from "@hevy-mcp/hevy-client";
import type {
	BodyMeasurement,
	GetV1BodyMeasurements200,
	GetV1Workouts200,
	Workout,
} from "@hevy-mcp/hevy-client/types";
import { DateTime, Effect } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it, vi } from "vitest";
import { createBodyMeasurementsListOperation } from "./body-measurements.js";
import { createWorkoutsListOperation } from "./workouts.js";
import {
	createWorkflowsTrainingSummaryOperation,
	scanPagesInWindow,
	type WorkflowsTrainingSummaryOperations,
} from "./workflows.js";

const FIXED_NOW = DateTime.toEpochMillis(
	DateTime.makeUnsafe("2026-07-16T12:00:00Z"),
);

function runAtFixedTime<A, E>(program: Effect.Effect<A, E>): Promise<A> {
	return Effect.runPromise(
		Effect.provide(
			Effect.gen(function* () {
				yield* TestClock.setTime(FIXED_NOW);
				return yield* program;
			}),
			TestClock.layer(),
		),
	);
}

function notFound(endpoint = "/v1/workouts") {
	return new NotFoundError({
		status: 404,
		method: "GET",
		endpoint,
		expected: true,
	});
}

type ListOperationsFixture = {
	readonly operations: WorkflowsTrainingSummaryOperations;
	readonly workoutRequests: Array<{
		readonly page: number;
		readonly pageSize: number;
		readonly options: unknown;
	}>;
	readonly measurementRequests: Array<{
		readonly page: number;
		readonly pageSize: number;
		readonly options: unknown;
	}>;
};

function createListOperations(
	workoutResponses: readonly (GetV1Workouts200 | Error)[],
	measurementResponses: readonly (GetV1BodyMeasurements200 | Error)[],
): ListOperationsFixture {
	let workoutResponseIndex = 0;
	let measurementResponseIndex = 0;
	const workoutRequests: Array<{
		readonly page: number;
		readonly pageSize: number;
		readonly options: unknown;
	}> = [];
	const measurementRequests: Array<{
		readonly page: number;
		readonly pageSize: number;
		readonly options: unknown;
	}> = [];

	const workouts = createWorkoutsListOperation({
		getWorkouts(params, options) {
			workoutRequests.push({
				page: params?.page ?? 1,
				pageSize: params?.pageSize ?? 10,
				options,
			});
			const response = workoutResponses[workoutResponseIndex++] ?? {
				workouts: [],
			};
			return response instanceof Error
				? Effect.fail(response)
				: Effect.succeed(response);
		},
	});
	const bodyMeasurements = createBodyMeasurementsListOperation({
		getBodyMeasurements(params, options) {
			measurementRequests.push({
				page: params?.page ?? 1,
				pageSize: params?.pageSize ?? 10,
				options,
			});
			const response = measurementResponses[measurementResponseIndex++] ?? {
				body_measurements: [],
			};
			return response instanceof Error
				? Effect.fail(response)
				: Effect.succeed(response);
		},
	});

	return {
		operations: { workouts, bodyMeasurements },
		workoutRequests,
		measurementRequests,
	};
}

describe("workflows.trainingSummary operation", () => {
	it("uses a deterministic UTC window and aggregates only in-window evidence", async () => {
		const oldWorkout: Workout = {
			id: "old",
			start_time: "2026-06-17T23:59:59Z",
		};
		const inWindowWorkout: Workout = {
			id: "w1",
			title: "Push",
			start_time: "2026-07-15T08:00:00Z",
			end_time: "2026-07-15T09:00:00Z",
			exercises: [
				{
					exercise_template_id: "bench",
					sets: [{}, {}],
				},
				{
					exercise_template_id: "",
					sets: [{}],
				},
			],
		};
		const boundaryWorkout: Workout = {
			id: "boundary",
			start_time: "2026-07-17T00:00:00Z",
			end_time: "2026-07-17T00:00:01Z",
		};
		const oldMeasurement: BodyMeasurement = {
			date: "2026-06-17",
			weight_kg: 81,
		};
		const earliestMeasurement: BodyMeasurement = {
			date: "2026-07-01",
			weight_kg: 80,
			lean_mass_kg: null,
			fat_percent: 20,
		};
		const latestMeasurement: BodyMeasurement = {
			date: "2026-07-15",
			weight_kg: 79,
			lean_mass_kg: 65,
		};
		const { operations, workoutRequests, measurementRequests } =
			createListOperations(
				[
					{
						page: 1,
						page_count: 2,
						workouts: [oldWorkout, inWindowWorkout],
					},
					{
						page: 2,
						page_count: 2,
						workouts: [boundaryWorkout],
					},
				],
				[
					{
						page: 1,
						page_count: 2,
						body_measurements: [oldMeasurement],
					},
					{
						page: 2,
						page_count: 2,
						body_measurements: [latestMeasurement, earliestMeasurement],
					},
				],
			);
		const operation = createWorkflowsTrainingSummaryOperation(operations);
		const options = { timeoutMs: 1_000 };

		await expect(
			runAtFixedTime(operation.effect({ weeks: 4 }, options)),
		).resolves.toEqual({
			period: {
				start_date: "2026-06-18",
				end_date: "2026-07-16",
				weeks: 4,
			},
			workouts: {
				count: 1,
				total_duration_seconds: 3_600,
				exercise_count: 2,
				set_count: 3,
				unique_exercise_template_ids: ["bench"],
				sessions: [
					{
						id: "w1",
						title: "Push",
						start_time: "2026-07-15T08:00:00Z",
						end_time: "2026-07-15T09:00:00Z",
						duration_seconds: 3_600,
						exercise_count: 2,
						set_count: 3,
					},
				],
			},
			body_measurements: {
				count: 2,
				earliest: {
					date: "2026-07-01",
					weight_kg: 80,
					fat_percent: 20,
				},
				latest: {
					date: "2026-07-15",
					weight_kg: 79,
					lean_mass_kg: 65,
				},
				weight_change_kg: -1,
			},
			workflow: {
				name: "training-summary",
				pagination: { workouts: 2, body_measurements: 2 },
				cacheStatus: "not-used",
				itemsScanned: 6,
			},
		});
		expect(workoutRequests).toEqual([
			{ page: 1, pageSize: 10, options },
			{ page: 2, pageSize: 10, options },
		]);
		expect(measurementRequests).toEqual([
			{ page: 1, pageSize: 10, options },
			{ page: 2, pageSize: 10, options },
		]);
	});

	it("rejects weeks outside the one-to-twelve-week contract before scanning", async () => {
		const getWorkouts = vi.fn(() => Effect.succeed({ workouts: [] }));
		const getBodyMeasurements = vi.fn(() =>
			Effect.succeed({ body_measurements: [] }),
		);
		const workouts = createWorkoutsListOperation({ getWorkouts });
		const bodyMeasurements = createBodyMeasurementsListOperation({
			getBodyMeasurements,
		});
		const operation = createWorkflowsTrainingSummaryOperation({
			workouts,
			bodyMeasurements,
		});

		await expect(
			runAtFixedTime(operation.effect({ weeks: 0 })),
		).rejects.toMatchObject({
			_tag: "TrainingSummaryValidationError",
			weeks: 0,
		});
		await expect(
			runAtFixedTime(operation.effect({ weeks: 13 })),
		).rejects.toMatchObject({
			_tag: "TrainingSummaryValidationError",
			weeks: 13,
		});
		expect(getWorkouts).not.toHaveBeenCalled();
		expect(getBodyMeasurements).not.toHaveBeenCalled();
	});

	it("ends a loader on a later-page 404 but fails a first-page 404", async () => {
		const laterPage = createListOperations(
			[
				{
					page: 1,
					page_count: 3,
					workouts: [{ id: "w1", start_time: "2026-07-15T08:00:00Z" }],
				},
				notFound(),
			],
			[
				{
					page: 1,
					page_count: 1,
					body_measurements: [],
				},
			],
		);
		const laterPageOperation = createWorkflowsTrainingSummaryOperation(
			laterPage.operations,
		);
		await expect(
			runAtFixedTime(laterPageOperation.effect({ weeks: 1 })),
		).resolves.toMatchObject({
			workouts: { count: 1 },
			workflow: {
				pagination: { workouts: 1, body_measurements: 1 },
				itemsScanned: 1,
			},
		});
		expect(laterPage.workoutRequests).toHaveLength(2);

		const firstPage = createListOperations(
			[notFound()],
			[{ page: 1, page_count: 1, body_measurements: [] }],
		);
		const firstPageOperation = createWorkflowsTrainingSummaryOperation(
			firstPage.operations,
		);
		await expect(
			runAtFixedTime(firstPageOperation.effect({ weeks: 1 })),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("returns an empty scan without loading when a window cannot be parsed", async () => {
		const loader = vi.fn(() =>
			Effect.succeed({
				items: [{ id: "unexpected" }],
				pageCount: 1,
			}),
		);

		await expect(
			Effect.runPromise(
				// The helper is intentionally Effect-valued so its loader remains
				// lazy when either boundary is invalid.
				scanPagesInWindow(
					loader,
					10,
					"not-a-date",
					"2026-07-16",
					(item: { id: string }) => item.id,
				),
			),
		).resolves.toEqual({
			items: [],
			pages: 0,
			itemsScanned: 0,
		});
		expect(loader).not.toHaveBeenCalled();
	});
});
