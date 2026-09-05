import { DateTime, Effect, Option, Predicate, Stream } from "effect";
import type {
	HevyExecutionOptions,
	HevyOperationSafety,
} from "@hevy-mcp/hevy-client";
import type { HevyRequestEffectError } from "@hevy-mcp/hevy-client/internal";
import type { BodyMeasurement, Workout } from "@hevy-mcp/hevy-client/types";
import {
	PaginationMismatchError,
	TrainingSummaryDataError,
	TrainingSummaryValidationError,
	isExpectedReadEndOfList,
} from "./operation-errors.js";
import type {
	BodyMeasurementsListOperation,
	BodyMeasurementsListOutput,
} from "./body-measurements.js";
import type { WorkoutsListOperation, WorkoutsListOutput } from "./workouts.js";

const TRAINING_SUMMARY_PAGE_SIZE = 10;
const MAX_TRAINING_SUMMARY_WEEKS = 12;
const MIN_TRAINING_SUMMARY_WEEKS = 1;
const SCAN_CONCURRENCY = 2;

export interface TrainingSummaryInput {
	readonly weeks: number;
}

export interface TrainingSummaryOperationOptions {
	readonly maxWeeks?: number;
	readonly strictPagination?: boolean;
}

export interface TrainingSummaryPeriod {
	readonly start_date: string;
	readonly end_date: string;
	readonly weeks: number;
}

export interface TrainingSummarySession {
	readonly id?: string;
	readonly title?: string;
	readonly start_time?: string;
	readonly end_time?: string;
	readonly duration_seconds?: number;
	readonly exercise_count: number;
	readonly set_count: number;
}

export interface TrainingSummaryMeasurement {
	readonly date: string;
	readonly weight_kg?: number;
	readonly lean_mass_kg?: number;
	readonly fat_percent?: number;
}

type MutableTrainingSummarySession = {
	id?: string;
	title?: string;
	start_time?: string;
	end_time?: string;
	duration_seconds?: number;
	exercise_count: number;
	set_count: number;
};

type MutableTrainingSummaryMeasurement = {
	date: string;
	weight_kg?: number;
	lean_mass_kg?: number;
	fat_percent?: number;
};

type MutableTrainingSummaryBodyMeasurements = {
	count: number;
	latest?: TrainingSummaryMeasurement;
	earliest?: TrainingSummaryMeasurement;
	weight_change_kg?: number;
};

export interface TrainingSummaryResult {
	readonly period: TrainingSummaryPeriod;
	readonly workouts: {
		readonly count: number;
		readonly total_duration_seconds: number;
		readonly exercise_count: number;
		readonly set_count: number;
		readonly total_volume_kg?: number;
		readonly unique_exercise_template_ids: string[];
		readonly sessions: TrainingSummarySession[];
	};
	readonly body_measurements: {
		readonly count: number;
		readonly latest?: TrainingSummaryMeasurement;
		readonly earliest?: TrainingSummaryMeasurement;
		readonly weight_change_kg?: number;
	};
	readonly workflow: {
		readonly name: "training-summary";
		readonly pagination: {
			readonly workouts: number;
			readonly body_measurements: number;
		};
		readonly cacheStatus: "not-used";
		readonly itemsScanned: number;
	};
}

export type WorkflowsTrainingSummaryOperations =
	| {
			readonly workouts: WorkoutsListOperation;
			readonly bodyMeasurements: BodyMeasurementsListOperation;
	  }
	| {
			readonly workouts: {
				readonly list: WorkoutsListOperation;
			};
			readonly bodyMeasurements: {
				readonly list: BodyMeasurementsListOperation;
			};
	  };

export interface WorkflowsTrainingSummaryDescriptor {
	readonly id: "workflows.trainingSummary";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const workflowsTrainingSummaryDescriptor: WorkflowsTrainingSummaryDescriptor =
	{
		id: "workflows.trainingSummary",
		safety: "read",
	};

export interface WorkflowsTrainingSummaryOperation {
	readonly descriptor: WorkflowsTrainingSummaryDescriptor;
	readonly effect: (
		input: TrainingSummaryInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<
		TrainingSummaryResult,
		| HevyRequestEffectError
		| PaginationMismatchError
		| TrainingSummaryDataError
		| TrainingSummaryValidationError
	>;
	execute(
		input: TrainingSummaryInput,
		options?: HevyExecutionOptions,
	): Promise<TrainingSummaryResult>;
}

export type TrainingSummaryOperation = WorkflowsTrainingSummaryOperation;
export type TrainingSummaryOperations = WorkflowsTrainingSummaryOperations;
export type TrainingSummaryAdapter = WorkflowsTrainingSummaryOperations;

export interface TrainingSummaryPage<T> {
	readonly items: readonly T[];
	readonly pageCount?: number;
	readonly endOfList?: boolean;
}

export interface TrainingSummaryScanResult<T> {
	readonly items: T[];
	readonly pages: number;
	readonly itemsScanned: number;
}

export type TrainingSummaryPageLoader<T> = (
	page: number,
	pageSize: number,
	options?: HevyExecutionOptions,
) => Effect.Effect<
	TrainingSummaryPage<T>,
	HevyRequestEffectError | PaginationMismatchError
>;

function parseUtcDate(value: string | undefined): DateTime.Utc | undefined {
	if (value === undefined) return undefined;
	const parsed = DateTime.make(value);
	return Option.isSome(parsed) ? parsed.value : undefined;
}

function hasNextPage(pageCount: number | undefined, page: number): boolean {
	return (
		Predicate.isNumber(pageCount) &&
		Number.isSafeInteger(pageCount) &&
		pageCount > page
	);
}

function hasInvalidPageCount(
	pageCount: number | undefined,
	page: number,
	hasItems: boolean,
): boolean {
	return (
		!Predicate.isNumber(pageCount) ||
		!Number.isSafeInteger(pageCount) ||
		pageCount < 0 ||
		(pageCount === 0 && (page > 1 || hasItems)) ||
		(pageCount > 0 && pageCount < page)
	);
}

/**
 * Collect pages while retaining only items in the requested UTC window.
 *
 * A collection's later-page 404 is represented by the list operation as an
 * end-of-list marker. It terminates the stream without counting a page that
 * did not return data.
 */
export const scanPagesInWindow = Effect.fn(
	"operations.workflows.scanPagesInWindow",
)(function* <T>(
	loader: TrainingSummaryPageLoader<T>,
	pageSize: number,
	startDate: string,
	endDate: string,
	getDate: (item: T) => string | undefined,
	options?: HevyExecutionOptions,
	strictPagination = false,
): Effect.fn.Return<
	TrainingSummaryScanResult<T>,
	HevyRequestEffectError | PaginationMismatchError | TrainingSummaryDataError
> {
	const start = parseUtcDate(startDate);
	const end = parseUtcDate(endDate);
	if (start === undefined || end === undefined) {
		return { items: [], pages: 0, itemsScanned: 0 };
	}

	const startMillis = DateTime.toEpochMillis(start);
	const endExclusiveMillis = DateTime.toEpochMillis(
		DateTime.add(end, { days: 1 }),
	);
	const pageStream = Stream.paginate<
		{ readonly page: number },
		TrainingSummaryPage<T>,
		HevyRequestEffectError | PaginationMismatchError
	>({ page: 1 }, (cursor) => {
		const request =
			options === undefined
				? loader(cursor.page, pageSize)
				: loader(cursor.page, pageSize, options);
		return request.pipe(
			Effect.flatMap(
				(
					pageResult,
				): Effect.Effect<
					readonly [
						ReadonlyArray<TrainingSummaryPage<T>>,
						Option.Option<{ readonly page: number }>,
					],
					HevyRequestEffectError | PaginationMismatchError
				> => {
					if (pageResult.endOfList === true) {
						return Effect.succeed([
							[] as ReadonlyArray<TrainingSummaryPage<T>>,
							Option.none<{ readonly page: number }>(),
						] as const);
					}

					if (
						strictPagination &&
						hasInvalidPageCount(
							pageResult.pageCount,
							cursor.page,
							pageResult.items.length > 0,
						)
					) {
						return Effect.fail(
							new PaginationMismatchError({
								requested: cursor.page,
								received: Predicate.isNumber(pageResult.pageCount)
									? pageResult.pageCount
									: -1,
								collection: "training-summary",
								message: "The API returned invalid pagination metadata",
							}),
						);
					}
					const nextPage =
						pageResult.items.length > 0 &&
						hasNextPage(pageResult.pageCount, cursor.page)
							? Option.some({ page: cursor.page + 1 })
							: Option.none<{ readonly page: number }>();
					return Effect.succeed([
						[pageResult] as ReadonlyArray<TrainingSummaryPage<T>>,
						nextPage,
					] as const);
				},
			),
		);
	});
	const pages = yield* Stream.runCollect(pageStream);
	const items: T[] = [];
	let itemsScanned = 0;
	for (const page of pages) {
		itemsScanned += page.items.length;
		for (const item of page.items) {
			const date = parseUtcDate(getDate(item));
			if (date === undefined) {
				return yield* new TrainingSummaryDataError({
					collection: "training-summary",
					message: "The API returned an item with an invalid date",
				});
			}
			const timestamp = DateTime.toEpochMillis(date);
			if (timestamp >= startMillis && timestamp < endExclusiveMillis) {
				items.push(item);
			}
		}
	}
	return {
		items,
		pages: pages.length,
		itemsScanned,
	};
});

function compactSession(workout: Workout): TrainingSummarySession {
	const exercises = workout.exercises ?? [];
	const start = parseUtcDate(workout.start_time);
	const end = parseUtcDate(workout.end_time);
	const duration =
		start === undefined || end === undefined
			? undefined
			: DateTime.toEpochMillis(end) - DateTime.toEpochMillis(start);
	const durationSeconds =
		duration === undefined || duration < 0
			? undefined
			: Math.floor(duration / 1_000);
	const session: MutableTrainingSummarySession = {
		exercise_count: exercises.length,
		set_count: exercises.reduce(
			(total, exercise) => total + (exercise.sets?.length ?? 0),
			0,
		),
	};
	if (workout.id) session.id = workout.id;
	if (workout.title) session.title = workout.title;
	if (workout.start_time) session.start_time = workout.start_time;
	if (workout.end_time) session.end_time = workout.end_time;
	if (durationSeconds !== undefined) session.duration_seconds = durationSeconds;
	return session;
}

function workoutVolume(workout: Workout): number {
	let total = 0;
	for (const exercise of workout.exercises ?? []) {
		for (const set of exercise.sets ?? []) {
			if (
				Predicate.isNumber(set.weight_kg) &&
				Number.isFinite(set.weight_kg) &&
				Predicate.isNumber(set.reps) &&
				Number.isFinite(set.reps)
			) {
				total += set.weight_kg * set.reps;
			}
		}
	}
	return total;
}

function compactMeasurement(
	measurement: BodyMeasurement,
): TrainingSummaryMeasurement {
	const result: MutableTrainingSummaryMeasurement = { date: measurement.date };
	if (measurement.weight_kg != null) result.weight_kg = measurement.weight_kg;
	if (measurement.lean_mass_kg != null) {
		result.lean_mass_kg = measurement.lean_mass_kg;
	}
	if (measurement.fat_percent != null) {
		result.fat_percent = measurement.fat_percent;
	}
	return result;
}

function workoutListOperation(
	operations: WorkflowsTrainingSummaryOperations,
): WorkoutsListOperation {
	return "effect" in operations.workouts
		? operations.workouts
		: operations.workouts.list;
}

function measurementListOperation(
	operations: WorkflowsTrainingSummaryOperations,
): BodyMeasurementsListOperation {
	return "effect" in operations.bodyMeasurements
		? operations.bodyMeasurements
		: operations.bodyMeasurements.list;
}

function loadWorkoutsPage(
	operation: WorkoutsListOperation,
): TrainingSummaryPageLoader<Workout> {
	return (page, pageSize, options) => {
		const result =
			options === undefined
				? operation.effect({ page, pageSize })
				: operation.effect({ page, pageSize }, options);
		return result.pipe(
			Effect.map((response: WorkoutsListOutput) => ({
				items: response.items,
				pageCount: response.pageCount,
				endOfList: response.expected404Outcome === "end_of_list",
			})),
			Effect.catchIf(
				(error) => isExpectedReadEndOfList(error, "/v1/workouts", page),
				() => Effect.succeed({ items: [], endOfList: true }),
			),
		);
	};
}

function loadMeasurementsPage(
	operation: BodyMeasurementsListOperation,
): TrainingSummaryPageLoader<BodyMeasurement> {
	return (page, pageSize, options) => {
		const result =
			options === undefined
				? operation.effect({ page, pageSize })
				: operation.effect({ page, pageSize }, options);
		return result.pipe(
			Effect.map((response: BodyMeasurementsListOutput) => ({
				items: response.items,
				pageCount: response.pageCount,
				endOfList: response.expected404Outcome === "end_of_list",
			})),
			Effect.catchIf(
				(error) =>
					isExpectedReadEndOfList(error, "/v1/body_measurements", page),
				() => Effect.succeed({ items: [], endOfList: true }),
			),
		);
	};
}

export function createWorkflowsTrainingSummaryOperation(
	operations: WorkflowsTrainingSummaryOperations,
	options: TrainingSummaryOperationOptions = {},
): WorkflowsTrainingSummaryOperation {
	const maxWeeks = options.maxWeeks ?? MAX_TRAINING_SUMMARY_WEEKS;
	const strictPagination = options.strictPagination ?? false;
	const effect = Effect.fn("operations.workflows.trainingSummary")(function* (
		input: TrainingSummaryInput,
		options?: HevyExecutionOptions,
	): Effect.fn.Return<
		TrainingSummaryResult,
		| HevyRequestEffectError
		| PaginationMismatchError
		| TrainingSummaryDataError
		| TrainingSummaryValidationError
	> {
		if (
			!Number.isInteger(input.weeks) ||
			input.weeks < MIN_TRAINING_SUMMARY_WEEKS ||
			input.weeks > maxWeeks
		) {
			return yield* new TrainingSummaryValidationError({
				weeks: input.weeks,
				message: `Training summary weeks must be an integer from ${MIN_TRAINING_SUMMARY_WEEKS} through ${maxWeeks}`,
			});
		}

		const now = yield* DateTime.now;
		const end = DateTime.startOf(now, "day");
		const start = DateTime.subtract(end, { days: input.weeks * 7 });
		const period = {
			start_date: DateTime.formatIsoDateUtc(start),
			end_date: DateTime.formatIsoDateUtc(end),
			weeks: input.weeks,
		};
		const workoutLoader = loadWorkoutsPage(workoutListOperation(operations));
		const measurementLoader = loadMeasurementsPage(
			measurementListOperation(operations),
		);
		const [workoutScan, measurementScan] = yield* Effect.all(
			[
				scanPagesInWindow(
					workoutLoader,
					TRAINING_SUMMARY_PAGE_SIZE,
					period.start_date,
					period.end_date,
					(workout) => workout.start_time,
					options,
					strictPagination,
				),
				scanPagesInWindow(
					measurementLoader,
					TRAINING_SUMMARY_PAGE_SIZE,
					period.start_date,
					period.end_date,
					(measurement) => measurement.date,
					options,
					strictPagination,
				),
			],
			{ concurrency: SCAN_CONCURRENCY },
		);

		const workouts = workoutScan.items;
		const sessions = workouts.map(compactSession);
		const uniqueExerciseTemplateIds = [
			...new Set(
				workouts.flatMap((workout) =>
					(workout.exercises ?? [])
						.map((exercise) => exercise.exercise_template_id)
						.filter((id): id is string => Boolean(id)),
				),
			),
		];
		const measurements = [...measurementScan.items].sort((left, right) =>
			left.date.localeCompare(right.date),
		);
		const earliestMeasurement = measurements[0];
		const latestMeasurement = measurements.at(-1);
		const earliest =
			earliestMeasurement === undefined
				? undefined
				: compactMeasurement(earliestMeasurement);
		const latest =
			latestMeasurement === undefined
				? undefined
				: compactMeasurement(latestMeasurement);
		const weightChange =
			latest?.weight_kg !== undefined && earliest?.weight_kg !== undefined
				? latest.weight_kg - earliest.weight_kg
				: undefined;
		const bodyMeasurements: MutableTrainingSummaryBodyMeasurements = {
			count: measurements.length,
		};
		if (latest !== undefined) bodyMeasurements.latest = latest;
		if (earliest !== undefined) bodyMeasurements.earliest = earliest;
		if (weightChange !== undefined) {
			bodyMeasurements.weight_change_kg = weightChange;
		}
		return {
			period,
			workouts: {
				count: workouts.length,
				total_duration_seconds: sessions.reduce(
					(total, session) => total + (session.duration_seconds ?? 0),
					0,
				),
				exercise_count: sessions.reduce(
					(total, session) => total + session.exercise_count,
					0,
				),
				set_count: sessions.reduce(
					(total, session) => total + session.set_count,
					0,
				),
				total_volume_kg: workouts.reduce(
					(total, workout) => total + workoutVolume(workout),
					0,
				),
				unique_exercise_template_ids: uniqueExerciseTemplateIds,
				sessions,
			},
			body_measurements: bodyMeasurements,
			workflow: {
				name: "training-summary" as const,
				pagination: {
					workouts: workoutScan.pages,
					body_measurements: measurementScan.pages,
				},
				cacheStatus: "not-used",
				itemsScanned: workoutScan.itemsScanned + measurementScan.itemsScanned,
			},
		};
	});

	const operation: WorkflowsTrainingSummaryOperation = {
		descriptor: workflowsTrainingSummaryDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

export const createTrainingSummaryOperation =
	createWorkflowsTrainingSummaryOperation;

export const trainingSummaryDescriptor = workflowsTrainingSummaryDescriptor;
