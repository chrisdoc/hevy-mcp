import type { HevyClient } from "@hevy-mcp/hevy-client";
import {
	getV1BodyMeasurementsQueryParamsSchema,
	getV1RoutinesQueryParamsSchema,
} from "@hevy-mcp/hevy-client/schemas";
import {
	parseExerciseHistoryId,
	parseExerciseHistoryOptions,
	parseExerciseId,
	parseMeasurementDate,
	parseSearchMaxPages,
	parsePagination,
	parseRoutineId,
	parseSearchQuery,
	parseWeeks,
	parseWorkoutEventsOptions,
	parseWorkoutId,
	UsageError,
	type CliArgs,
} from "../arguments.js";
import { ApiResponseError } from "../errors.js";
import { normalize, pageEnvelope } from "../output/normalize.js";

type Body = Record<string, unknown>;
function body(value: unknown): Body {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Body)
		: {};
}
function array(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}
function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}
function list(data: Body, source: string, output: string, page: number): Body {
	const count = data.page_count;
	if (
		typeof count !== "number" ||
		!Number.isInteger(count) ||
		count < 0 ||
		(data.page !== undefined && data.page !== page)
	)
		throw new ApiResponseError("The API returned invalid pagination metadata");
	if (count > 0 && page > count)
		throw new UsageError("Requested page exceeds the API page count");
	return pageEnvelope(
		data,
		output,
		Array.isArray(data[source]) ? data[source] : [],
	);
}

export async function execute(
	args: CliArgs,
	client: HevyClient,
	now = () => new Date(),
): Promise<unknown> {
	const command = args.command;
	const sub = args.subcommand;
	if (command === "user" && !sub)
		return { user: normalize(await client.getUserInfo()) };
	if (command === "workouts") {
		if (sub === "list") {
			const { page, pageSize } = parsePagination(args);
			return list(
				body(await client.getWorkouts({ page, pageSize })),
				"workouts",
				"workouts",
				page,
			);
		}
		if (sub === "get") {
			const workoutId = parseWorkoutId(args.positionals[0]);
			return {
				workout: normalize(await client.getWorkout(workoutId)),
			};
		}
		if (sub === "count")
			return { count: body(await client.getWorkoutCount()).workout_count ?? 0 };
		if (sub === "events") {
			const options = parseWorkoutEventsOptions(args);
			return {
				...list(
					body(await client.getWorkoutEvents(options)),
					"events",
					"events",
					options.page,
				),
				since: options.since,
			};
		}
	}
	if (command === "routines") {
		if (sub === "list") {
			const { page, pageSize } = parsePagination(
				args,
				getV1RoutinesQueryParamsSchema,
			);
			return list(
				body(await client.getRoutines({ page, pageSize })),
				"routines",
				"routines",
				page,
			);
		}
		if (sub === "get") {
			const routineId = parseRoutineId(args.positionals[0]);
			return {
				routine: normalize(await client.getRoutineById(routineId)),
			};
		}
	}
	if (command === "exercises") {
		if (sub === "get") {
			const exerciseId = parseExerciseId(args.positionals[0]);
			return {
				exercise: normalize(await client.getExerciseTemplate(exerciseId)),
			};
		}
		if (sub === "history") {
			const exerciseId = parseExerciseHistoryId(args.positionals[0]);
			const options = parseExerciseHistoryOptions(args);
			return {
				exerciseTemplateId: exerciseId,
				history: normalize(
					(await client.getExerciseHistory(exerciseId, options))
						.exercise_history ?? [],
				),
			};
		}
		if (sub === "search") {
			const query = parseSearchQuery(args.positionals[0]);
			const maxPages = parseSearchMaxPages(args);
			const matches: unknown[] = [];
			let pagesScanned = 0;
			let pageCount = 1;
			while (pagesScanned < pageCount && pagesScanned < maxPages) {
				const requestedPage = pagesScanned + 1;
				const result = body(
					await client.getExerciseTemplates({
						page: requestedPage,
						pageSize: 100,
					}),
				);
				pageCount = result.page_count as number;
				if (
					!Number.isInteger(pageCount) ||
					pageCount < 0 ||
					(result.page !== undefined && result.page !== requestedPage) ||
					(pageCount > 0 && pageCount < requestedPage)
				)
					throw new ApiResponseError(
						"The API returned invalid pagination metadata",
					);
				pagesScanned += 1;
				if (pageCount === 0) break;
				for (const item of Array.isArray(result.exercise_templates)
					? result.exercise_templates
					: [])
					if (text(body(item).title).toLocaleLowerCase().includes(query))
						matches.push(normalize(item));
			}
			return {
				query,
				matches,
				pagesScanned,
				complete: pagesScanned >= pageCount,
			};
		}
	}
	if (command === "measurements") {
		if (sub === "list") {
			const { page, pageSize } = parsePagination(
				args,
				getV1BodyMeasurementsQueryParamsSchema,
			);
			return list(
				body(await client.getBodyMeasurements({ page, pageSize })),
				"body_measurements",
				"measurements",
				page,
			);
		}
		if (sub === "get") {
			const date = parseMeasurementDate(args.positionals[0]);
			return { measurement: normalize(await client.getBodyMeasurement(date)) };
		}
	}
	if (command === "summary") {
		const weeks = parseWeeks(args);
		const to = now();
		const from = new Date(to.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
		let pageNumber = 1;
		let pageCount = 1;
		let pagesScanned = 0;
		const workouts: Body[] = [];
		let stoppedEarly = false;
		while (pageNumber <= pageCount) {
			const result = body(
				await client.getWorkouts({ page: pageNumber, pageSize: 10 }),
			);
			pageCount = result.page_count as number;
			if (
				!Number.isInteger(pageCount) ||
				pageCount < 0 ||
				(result.page !== undefined && result.page !== pageNumber) ||
				(pageCount > 0 && pageCount < pageNumber)
			)
				throw new ApiResponseError(
					"The API returned invalid pagination metadata",
				);
			pagesScanned += 1;
			if (pageCount === 0) break;
			const items = Array.isArray(result.workouts)
				? result.workouts.map(body)
				: [];
			for (const workout of items) {
				const timestamp = Date.parse(text(workout.start_time));
				if (Number.isNaN(timestamp))
					throw new ApiResponseError(
						"The API returned a workout with an invalid timestamp",
					);
				if (timestamp >= from.getTime() && timestamp <= to.getTime())
					workouts.push(workout);
			}
			const oldest = items.at(-1)?.start_time;
			if (oldest && Date.parse(text(oldest)) < from.getTime()) {
				stoppedEarly = true;
				break;
			}
			pageNumber += 1;
		}
		let exerciseCount = 0,
			setCount = 0,
			totalVolumeKg = 0,
			totalDurationSeconds = 0;
		for (const workout of workouts) {
			const start = Date.parse(text(workout.start_time));
			const end = Date.parse(text(workout.end_time));
			if (!Number.isNaN(start) && !Number.isNaN(end))
				totalDurationSeconds += Math.max(0, (end - start) / 1000);
			const exercises = array(workout.exercises);
			exerciseCount += exercises.length;
			for (const exercise of exercises)
				for (const set of array(body(exercise).sets)) {
					setCount += 1;
					const item = body(set);
					if (
						typeof item.weight_kg === "number" &&
						typeof item.reps === "number"
					)
						totalVolumeKg += item.weight_kg * item.reps;
				}
		}
		return {
			weeks,
			from: from.toISOString(),
			to: to.toISOString(),
			workoutCount: workouts.length,
			totalDurationSeconds,
			exerciseCount,
			setCount,
			totalVolumeKg,
			pagesScanned,
			complete:
				stoppedEarly || pageNumber > pageCount || pagesScanned === pageCount,
		};
	}
	throw new UsageError("Unknown command; run hevy --help");
}
