import { z } from "zod";
import type {
	BodyMeasurement,
	GetV1BodyMeasurements200,
	GetV1Workouts200,
	Workout,
} from "../generated/client/types/index.js";
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

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

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
	start.setUTCDate(start.getUTCDate() - weeks * 7);
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
			exerciseCount: sessions.reduce(
				(total, session) => total + session.exerciseCount,
				0,
			),
			setCount: sessions.reduce(
				(total, session) => total + session.setCount,
				0,
			),
			uniqueExerciseTemplateIds,
			sessions,
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
		description: describeTool({
			summary:
				"Read-only. Summarizes recent workout activity and body-measurement trends in one call.",
			aliases: [
				"training progress",
				"progress summary",
				"recent training overview",
			],
			useCase:
				"Use for a bounded progress review instead of separately counting and paging through workouts and body measurements.",
			importantNotes:
				"The summary covers the most recent 1-12 weeks, returns compact session evidence, and reports the pages and items scanned.",
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
