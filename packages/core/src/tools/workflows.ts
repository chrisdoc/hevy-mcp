import { z } from "zod";
import type {
	BodyMeasurement,
	GetV1BodyMeasurements200,
	GetV1Workouts200,
	Workout,
} from "@hevy-mcp/hevy-client/types";
import {
	trainingSummaryResponse,
	type TrainingSummaryResult,
} from "../utils/response-contracts.js";
import { readOnlyAnnotations } from "../utils/tool-annotations.js";

import type { InferToolParams } from "../utils/tool-helpers.js";
import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";

const trainingSummarySchema = {
	weeks: z.coerce.number().int().min(1).max(12).default(4),
} as const;

type TrainingSummaryParams = InferToolParams<typeof trainingSummarySchema>;

type RecentPageResult<T> = {
	items: readonly T[];
	pages: number;
	itemsScanned: number;
};

type WorkoutExercise = NonNullable<Workout["exercises"]>[number];
type WorkoutSet = NonNullable<WorkoutExercise["sets"]>[number];

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const EXERCISE_TREND_LIMIT = 10;
const EXERCISE_SESSIONS_LIMIT = 6;

function parseUtcDate(value: string): number | undefined {
	const normalized = value.length === 10 ? `${value}T00:00:00.000Z` : value;
	const timestamp = Date.parse(normalized);
	return Number.isFinite(timestamp) ? timestamp : undefined;
}

async function fetchRecentPages<T>(
	loader: (
		page: number,
		pageSize: number,
	) => Promise<{ items: readonly T[]; pageCount?: number }>,
	pageSize: number,
	startDate: string,
	endDate: string,
	getDate: (item: T) => string | undefined,
): Promise<RecentPageResult<T>> {
	const items: T[] = [];
	let page = 1;
	let itemsScanned = 0;
	const startTimestamp = parseUtcDate(startDate);
	const endTimestamp = parseUtcDate(endDate);
	if (startTimestamp === undefined || endTimestamp === undefined) {
		return { items, pages: 0, itemsScanned };
	}
	const endExclusiveTimestamp = endTimestamp + MILLISECONDS_PER_DAY;

	while (true) {
		const result = await loader(page, pageSize);
		itemsScanned += result.items.length;
		if (result.items.length === 0) break;
		for (const item of result.items) {
			const date = getDate(item);
			const timestamp = date === undefined ? undefined : parseUtcDate(date);
			if (
				timestamp !== undefined &&
				timestamp >= startTimestamp &&
				timestamp < endExclusiveTimestamp
			) {
				items.push(item);
			}
		}

		const lastDate = result.items
			.map(getDate)
			.filter((date): date is string => date !== undefined)
			.at(-1);
		const lastTimestamp =
			lastDate === undefined ? undefined : parseUtcDate(lastDate);
		if (lastTimestamp !== undefined && lastTimestamp < startTimestamp) {
			break;
		}
		const pageCount = result.pageCount;
		if (
			typeof pageCount !== "number" ||
			!Number.isSafeInteger(pageCount) ||
			pageCount <= page
		) {
			break;
		}
		page += 1;
	}
	return { items, pages: page, itemsScanned };
}

function utcDateString(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function getPeriod(weeks: number): {
	startDate: string;
	endDate: string;
} {
	const end = new Date();
	const start = new Date(end);
	start.setUTCDate(start.getUTCDate() - (weeks * 7 - 1));
	return { startDate: utcDateString(start), endDate: utcDateString(end) };
}

function durationSeconds(workout: Workout): number | undefined {
	if (!workout.start_time || !workout.end_time) return undefined;
	const duration =
		new Date(workout.end_time).getTime() -
		new Date(workout.start_time).getTime();
	return Number.isFinite(duration) && duration >= 0
		? Math.floor(duration / 1000)
		: undefined;
}

function compactSession(
	workout: Workout,
): TrainingSummaryResult["workouts"]["sessions"][number] {
	const exercises = workout.exercises ?? [];
	const elapsedSeconds = durationSeconds(workout);
	return {
		...(workout.id ? { id: workout.id } : {}),
		...(workout.title ? { title: workout.title } : {}),
		...(workout.start_time ? { start_time: workout.start_time } : {}),
		...(workout.end_time ? { end_time: workout.end_time } : {}),
		...(elapsedSeconds === undefined
			? {}
			: { duration_seconds: elapsedSeconds }),
		exercise_count: exercises.length,
		set_count: exercises.reduce(
			(total, exercise) => total + (exercise.sets?.length ?? 0),
			0,
		),
	};
}

function compactMeasurement(
	measurement: BodyMeasurement,
): NonNullable<TrainingSummaryResult["body_measurements"]["latest"]> {
	return {
		date: measurement.date,
		...(measurement.weight_kg == null
			? {}
			: { weight_kg: measurement.weight_kg }),
		...(measurement.lean_mass_kg == null
			? {}
			: { lean_mass_kg: measurement.lean_mass_kg }),
		...(measurement.fat_percent == null
			? {}
			: { fat_percent: measurement.fat_percent }),
	};
}

function exerciseSets(exercise: WorkoutExercise): readonly WorkoutSet[] {
	return exercise.sets ?? [];
}

function isWorkingSet(set: WorkoutSet): boolean {
	return set.type !== "warmup";
}

function countExercises(workouts: readonly Workout[]): number {
	return workouts.reduce(
		(total, workout) => total + (workout.exercises?.length ?? 0),
		0,
	);
}

function countSets(workouts: readonly Workout[]): number {
	return workouts.reduce(
		(total, workout) =>
			total +
			(workout.exercises ?? []).reduce(
				(exerciseTotal, exercise) =>
					exerciseTotal + exerciseSets(exercise).length,
				0,
			),
		0,
	);
}

function countWorkingSets(workouts: readonly Workout[]): number {
	return workouts.reduce(
		(total, workout) =>
			total +
			(workout.exercises ?? []).reduce(
				(exerciseTotal, exercise) =>
					exerciseTotal + exerciseSets(exercise).filter(isWorkingSet).length,
				0,
			),
		0,
	);
}

function buildWeeklySummary(
	workouts: readonly Workout[],
	period: TrainingSummaryResult["period"],
): TrainingSummaryResult["workouts"]["weekly"] {
	const periodStart = parseUtcDate(period.start_date);
	if (periodStart === undefined) return [];

	return Array.from({ length: period.weeks }, (_, index) => {
		const startTimestamp = periodStart + index * 7 * MILLISECONDS_PER_DAY;
		const endTimestamp = startTimestamp + 6 * MILLISECONDS_PER_DAY;
		const endExclusiveTimestamp = endTimestamp + MILLISECONDS_PER_DAY;
		const bucketWorkouts = workouts.filter((workout) => {
			const timestamp = workout.start_time
				? parseUtcDate(workout.start_time)
				: undefined;
			return (
				timestamp !== undefined &&
				timestamp >= startTimestamp &&
				timestamp < endExclusiveTimestamp
			);
		});

		return {
			start_date: utcDateString(new Date(startTimestamp)),
			end_date: utcDateString(new Date(endTimestamp)),
			workout_count: bucketWorkouts.length,
			total_duration_seconds: bucketWorkouts.reduce(
				(total, workout) => total + (durationSeconds(workout) ?? 0),
				0,
			),
			exercise_count: countExercises(bucketWorkouts),
			set_count: countSets(bucketWorkouts),
			working_set_count: countWorkingSets(bucketWorkouts),
		};
	});
}

function finiteValues(
	sets: readonly WorkoutSet[],
	select: (set: WorkoutSet) => number | null | undefined,
): number[] {
	return sets
		.map(select)
		.filter((value): value is number => Number.isFinite(value));
}

function sumOrNull(values: readonly number[]): number | null {
	return values.length === 0
		? null
		: values.reduce((total, value) => total + value, 0);
}

function maxOrNull(values: readonly number[]): number | null {
	return values.length === 0 ? null : Math.max(...values);
}

function compactExerciseSession(
	workout: Workout,
	exercises: readonly WorkoutExercise[],
	startTime: string,
): TrainingSummaryResult["workouts"]["exercise_trends"][number]["sessions"][number] {
	const sets = exercises.flatMap((exercise) => [...exerciseSets(exercise)]);
	const workingSets = sets.filter(isWorkingSet);
	const reps = finiteValues(workingSets, (set) => set.reps).filter(
		(value) => value >= 0,
	);
	const weights = finiteValues(workingSets, (set) => set.weight_kg);
	const rpes = finiteValues(workingSets, (set) => set.rpe);
	const distances = finiteValues(
		workingSets,
		(set) => set.distance_meters,
	).filter((value) => value >= 0);
	const durations = finiteValues(
		workingSets,
		(set) => set.duration_seconds,
	).filter((value) => value >= 0);
	const customMetrics = finiteValues(workingSets, (set) => set.custom_metric);
	const weightedRepVolumes = workingSets
		.map((set) => {
			const weight = set.weight_kg;
			const repetitions = set.reps;
			return Number.isFinite(weight) &&
				Number.isFinite(repetitions) &&
				(weight ?? -1) >= 0 &&
				(repetitions ?? -1) >= 0
				? (weight ?? 0) * (repetitions ?? 0)
				: undefined;
		})
		.filter((value): value is number => value !== undefined);

	return {
		...(workout.id ? { workout_id: workout.id } : {}),
		...(workout.title ? { workout_title: workout.title } : {}),
		start_time: startTime,
		set_count: sets.length,
		working_set_count: workingSets.length,
		total_reps: sumOrNull(reps),
		weighted_rep_volume_kg: sumOrNull(weightedRepVolumes),
		top_weight_kg: maxOrNull(weights),
		top_reps: maxOrNull(reps),
		top_rpe: maxOrNull(rpes),
		total_distance_meters: sumOrNull(distances),
		total_duration_seconds: sumOrNull(durations),
		total_custom_metric: sumOrNull(customMetrics),
	};
}

function buildExerciseTrends(
	workouts: readonly Workout[],
): Pick<
	TrainingSummaryResult["workouts"],
	"exercise_trends" | "exercise_trend_coverage"
> {
	type ExerciseGroup = {
		title?: string;
		titleTimestamp: number;
		sessions: Array<
			TrainingSummaryResult["workouts"]["exercise_trends"][number]["sessions"][number]
		>;
	};
	const groups = new Map<string, ExerciseGroup>();

	for (const workout of workouts) {
		if (!workout.start_time) continue;
		const timestamp = parseUtcDate(workout.start_time);
		if (timestamp === undefined) continue;
		const exercisesByTemplate = new Map<string, WorkoutExercise[]>();
		for (const exercise of workout.exercises ?? []) {
			const exerciseTemplateId = exercise.exercise_template_id;
			if (!exerciseTemplateId) continue;
			const exercises = exercisesByTemplate.get(exerciseTemplateId) ?? [];
			exercises.push(exercise);
			exercisesByTemplate.set(exerciseTemplateId, exercises);
		}

		for (const [exerciseTemplateId, exercises] of exercisesByTemplate) {
			const existing = groups.get(exerciseTemplateId);
			const title = exercises.find((exercise) => exercise.title)?.title;
			const group = existing ?? {
				titleTimestamp: Number.NEGATIVE_INFINITY,
				sessions: [],
			};
			if (title && timestamp >= group.titleTimestamp) {
				group.title = title;
				group.titleTimestamp = timestamp;
			}
			group.sessions.push(
				compactExerciseSession(workout, exercises, workout.start_time),
			);
			groups.set(exerciseTemplateId, group);
		}
	}

	const ranked = [...groups.entries()]
		.map(([exerciseTemplateId, group]) => {
			const sessions = [...group.sessions].sort((left, right) =>
				left.start_time.localeCompare(right.start_time),
			);
			return {
				exercise_template_id: exerciseTemplateId,
				...(group.title ? { title: group.title } : {}),
				session_count: sessions.length,
				set_count: sessions.reduce(
					(total, session) => total + session.set_count,
					0,
				),
				working_set_count: sessions.reduce(
					(total, session) => total + session.working_set_count,
					0,
				),
				sessions: sessions.slice(-EXERCISE_SESSIONS_LIMIT),
				latest_start_time: sessions.at(-1)?.start_time ?? "",
			};
		})
		.sort(
			(left, right) =>
				right.session_count - left.session_count ||
				right.working_set_count - left.working_set_count ||
				right.latest_start_time.localeCompare(left.latest_start_time) ||
				left.exercise_template_id.localeCompare(right.exercise_template_id),
		);
	const exercise_trends = ranked
		.slice(0, EXERCISE_TREND_LIMIT)
		.map(({ latest_start_time: _latest_start_time, ...trend }) => trend);

	return {
		exercise_trends,
		exercise_trend_coverage: {
			eligible_exercise_count: ranked.length,
			included_exercise_count: exercise_trends.length,
			exercise_limit: EXERCISE_TREND_LIMIT,
			sessions_per_exercise_limit: EXERCISE_SESSIONS_LIMIT,
			truncated: ranked.length > exercise_trends.length,
		},
	};
}

export async function getTrainingSummary(
	runtime: ToolRuntime,
	weeks: number,
): Promise<TrainingSummaryResult> {
	const client = runtime.getClient();
	const period = getPeriod(weeks);
	const pageSize = 10;
	const [workoutPages, measurementPages] = await Promise.all([
		fetchRecentPages(
			async (page, pageSize) => {
				const data: GetV1Workouts200 = await client.getWorkouts({
					page,
					pageSize,
				});
				return { items: data?.workouts ?? [], pageCount: data?.page_count };
			},
			pageSize,
			period.startDate,
			period.endDate,
			(workout) => workout.start_time,
		),
		fetchRecentPages(
			async (page, pageSize) => {
				const data: GetV1BodyMeasurements200 = await client.getBodyMeasurements(
					{
						page,
						pageSize,
					},
				);
				return {
					items: data?.body_measurements ?? [],
					pageCount: data?.page_count,
				};
			},
			pageSize,
			period.startDate,
			period.endDate,
			(measurement) => measurement.date,
		),
	]);

	const workouts = workoutPages.items;
	const sessions = workouts.map(compactSession);
	const exerciseTrends = buildExerciseTrends(workouts);
	const unique_exercise_template_ids = [
		...new Set(
			workouts.flatMap((workout) =>
				(workout.exercises ?? [])
					.map((exercise) => exercise.exercise_template_id)
					.filter((id): id is string => Boolean(id)),
			),
		),
	];
	const measurements = [...measurementPages.items].sort((a, b) =>
		a.date.localeCompare(b.date),
	);
	const earliestMeasurement = measurements[0];
	const latestMeasurement = measurements.at(-1);
	const earliest = earliestMeasurement
		? compactMeasurement(earliestMeasurement)
		: undefined;
	const latest = latestMeasurement
		? compactMeasurement(latestMeasurement)
		: undefined;
	const weight_change_kg =
		latest?.weight_kg !== undefined && earliest?.weight_kg !== undefined
			? latest.weight_kg - earliest.weight_kg
			: undefined;

	return {
		period: { start_date: period.startDate, end_date: period.endDate, weeks },
		workouts: {
			count: workouts.length,
			total_duration_seconds: sessions.reduce(
				(total, session) => total + (session.duration_seconds ?? 0),
				0,
			),
			exercise_count: countExercises(workouts),
			set_count: countSets(workouts),
			working_set_count: countWorkingSets(workouts),
			unique_exercise_template_ids,
			sessions,
			weekly: buildWeeklySummary(workouts, {
				start_date: period.startDate,
				end_date: period.endDate,
				weeks,
			}),
			...exerciseTrends,
		},
		body_measurements: {
			count: measurements.length,
			...(latest ? { latest } : {}),
			...(earliest ? { earliest } : {}),
			...(weight_change_kg === undefined ? {} : { weight_change_kg }),
		},
		workflow: {
			name: "training-summary",
			pagination: {
				workouts: workoutPages.pages,
				body_measurements: measurementPages.pages,
			},
			cacheStatus: "not-used",
			itemsScanned: workoutPages.itemsScanned + measurementPages.itemsScanned,
		},
	};
}

export const workflowToolDefinitions = [
	{
		name: "get-training-summary",
		feature: "workflows" as const,
		operation: "get" as const,
		description:
			"Read-only. Summarizes weekly workout consistency, working sets, compact exercise trends, and body-measurement context in one call.",
		inputSchema: trainingSummarySchema,
		outputSchema: trainingSummaryResponse.outputSchema,
		annotations: readOnlyAnnotations("Get Training Summary"),
		kind: "read" as const,
		responseContract: trainingSummaryResponse,
		execute: async (runtime: ToolRuntime, args: TrainingSummaryParams) =>
			getTrainingSummary(runtime, args.weeks),
	},
] satisfies readonly ToolDefinition<Record<string, z.ZodTypeAny>, unknown>[];

export { fetchRecentPages };
