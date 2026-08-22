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
import { isFiniteNumber } from "../utils/type-predicates.js";

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

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function parseUtcDate(value: string): number | undefined {
	const normalized = value.length === 10 ? `${value}T00:00:00.000Z` : value;
	const timestamp = Date.parse(normalized);
	return Number.isFinite(timestamp) ? timestamp : undefined;
}

async function scanPagesInWindow<T>(
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

		const pageCount = result.pageCount;
		if (
			!isFiniteNumber(pageCount) ||
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

function getPeriod(weeks: number) {
	const end = new Date();
	const start = new Date(end);
	start.setUTCDate(start.getUTCDate() - weeks * 7);
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
	const session: TrainingSummaryResult["workouts"]["sessions"][number] = {
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
	if (elapsedSeconds !== undefined) session.duration_seconds = elapsedSeconds;
	return session;
}

function compactMeasurement(
	measurement: BodyMeasurement,
): NonNullable<TrainingSummaryResult["body_measurements"]["latest"]> {
	const result: NonNullable<
		TrainingSummaryResult["body_measurements"]["latest"]
	> = { date: measurement.date };
	if (measurement.weight_kg != null) result.weight_kg = measurement.weight_kg;
	if (measurement.lean_mass_kg != null)
		result.lean_mass_kg = measurement.lean_mass_kg;
	if (measurement.fat_percent != null)
		result.fat_percent = measurement.fat_percent;
	return result;
}

export async function getTrainingSummary(
	runtime: ToolRuntime,
	weeks: number,
): Promise<TrainingSummaryResult> {
	const client = runtime.getClient();
	const period = getPeriod(weeks);
	// Hevy caps pageSize at 10 and orders pages by creation time, so a full
	// sequential scan is the only correct option; parallelize or cache if latency bites.
	const pageSize = 10;
	const [workoutPages, measurementPages] = await Promise.all([
		scanPagesInWindow(
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
		scanPagesInWindow(
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

	const bodyMeasurements: TrainingSummaryResult["body_measurements"] = {
		count: measurements.length,
	};
	if (latest) bodyMeasurements.latest = latest;
	if (earliest) bodyMeasurements.earliest = earliest;
	if (weight_change_kg !== undefined)
		bodyMeasurements.weight_change_kg = weight_change_kg;

	return {
		period: { start_date: period.startDate, end_date: period.endDate, weeks },
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
			unique_exercise_template_ids,
			sessions,
		},
		body_measurements: bodyMeasurements,
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
			"Read-only. Summarizes workouts and body-measurement trends for the last 1–12 weeks, including compact session and scan evidence.",
		inputSchema: trainingSummarySchema,
		outputSchema: trainingSummaryResponse.outputSchema,
		annotations: readOnlyAnnotations("Get Training Summary"),
		kind: "read" as const,
		responseContract: trainingSummaryResponse,
		execute: async (runtime: ToolRuntime, args: TrainingSummaryParams) =>
			getTrainingSummary(runtime, args.weeks),
	},
] satisfies readonly ToolDefinition<Record<string, z.ZodTypeAny>, unknown>[];

export { scanPagesInWindow };
