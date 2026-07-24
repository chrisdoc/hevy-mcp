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
} from "../utils/response-formatter.js";
import { readOnlyAnnotations } from "../utils/tool-annotations.js";
import { describeTool } from "../utils/tool-descriptions.js";
import type { InferToolParams } from "../utils/tool-helpers.js";
import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";

const trainingSummarySchema = {
	weeks: z.coerce
		.number()
		.int()
		.min(1)
		.max(12)
		.default(4)
		.describe("Number of recent weeks to summarize (1-12)."),
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

function durationSeconds(workout: Workout): number | null {
	if (!workout.start_time || !workout.end_time) return null;
	const duration =
		new Date(workout.end_time).getTime() -
		new Date(workout.start_time).getTime();
	return Number.isFinite(duration) && duration >= 0
		? Math.floor(duration / 1000)
		: null;
}

function compactSession(
	workout: Workout,
): TrainingSummaryResult["workouts"]["sessions"][number] {
	const exercises = workout.exercises ?? [];
	return {
		...(workout.id ? { id: workout.id } : {}),
		...(workout.title ? { title: workout.title } : {}),
		...(workout.start_time ? { startTime: workout.start_time } : {}),
		...(workout.end_time ? { endTime: workout.end_time } : {}),
		durationSeconds: durationSeconds(workout),
		exerciseCount: exercises.length,
		setCount: exercises.reduce(
			(total, exercise) => total + (exercise.sets?.length ?? 0),
			0,
		),
	};
}

function compactMeasurement(
	measurement: BodyMeasurement,
): NonNullable<TrainingSummaryResult["bodyMeasurements"]["latest"]> {
	return {
		date: measurement.date,
		weightKg: measurement.weight_kg ?? null,
		leanMassKg: measurement.lean_mass_kg ?? null,
		fatPercent: measurement.fat_percent ?? null,
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
	const periodStart = parseUtcDate(period.startDate);
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
			startDate: utcDateString(new Date(startTimestamp)),
			endDate: utcDateString(new Date(endTimestamp)),
			workoutCount: bucketWorkouts.length,
			totalDurationSeconds: bucketWorkouts.reduce(
				(total, workout) => total + (durationSeconds(workout) ?? 0),
				0,
			),
			exerciseCount: countExercises(bucketWorkouts),
			setCount: countSets(bucketWorkouts),
			workingSetCount: countWorkingSets(bucketWorkouts),
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
): TrainingSummaryResult["workouts"]["exerciseTrends"][number]["sessions"][number] {
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
		...(workout.id ? { workoutId: workout.id } : {}),
		...(workout.title ? { workoutTitle: workout.title } : {}),
		startTime,
		setCount: sets.length,
		workingSetCount: workingSets.length,
		totalReps: sumOrNull(reps),
		weightedRepVolumeKg: sumOrNull(weightedRepVolumes),
		topWeightKg: maxOrNull(weights),
		topReps: maxOrNull(reps),
		topRpe: maxOrNull(rpes),
		totalDistanceMeters: sumOrNull(distances),
		totalDurationSeconds: sumOrNull(durations),
		totalCustomMetric: sumOrNull(customMetrics),
	};
}

function buildExerciseTrends(
	workouts: readonly Workout[],
): Pick<
	TrainingSummaryResult["workouts"],
	"exerciseTrends" | "exerciseTrendCoverage"
> {
	type ExerciseGroup = {
		title?: string;
		titleTimestamp: number;
		sessions: Array<
			TrainingSummaryResult["workouts"]["exerciseTrends"][number]["sessions"][number]
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
				left.startTime.localeCompare(right.startTime),
			);
			return {
				exerciseTemplateId,
				...(group.title ? { title: group.title } : {}),
				sessionCount: sessions.length,
				setCount: sessions.reduce(
					(total, session) => total + session.setCount,
					0,
				),
				workingSetCount: sessions.reduce(
					(total, session) => total + session.workingSetCount,
					0,
				),
				sessions: sessions.slice(-EXERCISE_SESSIONS_LIMIT),
				latestStartTime: sessions.at(-1)?.startTime ?? "",
			};
		})
		.sort(
			(left, right) =>
				right.sessionCount - left.sessionCount ||
				right.workingSetCount - left.workingSetCount ||
				right.latestStartTime.localeCompare(left.latestStartTime) ||
				left.exerciseTemplateId.localeCompare(right.exerciseTemplateId),
		);
	const exerciseTrends = ranked
		.slice(0, EXERCISE_TREND_LIMIT)
		.map(({ latestStartTime: _latestStartTime, ...trend }) => trend);

	return {
		exerciseTrends,
		exerciseTrendCoverage: {
			eligibleExerciseCount: ranked.length,
			includedExerciseCount: exerciseTrends.length,
			exerciseLimit: EXERCISE_TREND_LIMIT,
			sessionsPerExerciseLimit: EXERCISE_SESSIONS_LIMIT,
			truncated: ranked.length > exerciseTrends.length,
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
	const uniqueExerciseTemplateIds = [
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
		: null;
	const latest = latestMeasurement
		? compactMeasurement(latestMeasurement)
		: null;
	const weightChangeKg =
		latest?.weightKg !== null &&
		latest?.weightKg !== undefined &&
		earliest?.weightKg !== null &&
		earliest?.weightKg !== undefined
			? latest.weightKg - earliest.weightKg
			: null;

	return {
		period: { ...period, weeks },
		workouts: {
			count: workouts.length,
			totalDurationSeconds: sessions.reduce(
				(total, session) => total + (session.durationSeconds ?? 0),
				0,
			),
			exerciseCount: countExercises(workouts),
			setCount: countSets(workouts),
			workingSetCount: countWorkingSets(workouts),
			uniqueExerciseTemplateIds,
			sessions,
			weekly: buildWeeklySummary(workouts, { ...period, weeks }),
			...exerciseTrends,
		},
		bodyMeasurements: {
			count: measurements.length,
			latest,
			earliest,
			weightChangeKg,
		},
		workflow: {
			name: "training-summary",
			pagination: {
				workouts: workoutPages.pages,
				bodyMeasurements: measurementPages.pages,
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
		description: describeTool({
			summary:
				"Read-only. Summarizes weekly workout consistency, working sets, compact exercise trends, and body-measurement context in one call.",
			aliases: [
				"training progress",
				"progress summary",
				"recent training overview",
			],
			useCase:
				"Use for a bounded progress review instead of separately counting and paging through workouts and body measurements.",
			importantNotes:
				"The summary covers exactly 1-12 rolling weeks and at most 10 exercise trends with 6 recent sessions each. Working sets exclude explicit warmups; unavailable modality metrics are null.",
		}),
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
