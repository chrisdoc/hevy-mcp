import type { HevyClient } from "@hevy-mcp/hevy-client";
import {
	getV1BodyMeasurementsQueryParamsSchema,
	getV1RoutinesQueryParamsSchema,
} from "@hevy-mcp/hevy-client/schemas";
import {
	buildMeasurementPayload,
	buildRoutinePayload,
	createBodyMeasurementInputSchema,
	createRoutineInputSchema,
	existingBodyMeasurementSchema,
	exerciseTemplateInputSchema,
	mergeMeasurementPayload,
	routineFolderInputSchema,
	updateBodyMeasurementInputSchema,
	updateRoutineInputSchema,
	replaceWorkoutInputSchema,
	workoutInputSchema,
} from "@hevy-mcp/core/mutations";
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
	requireMutationConfirmation,
	UsageError,
	type CliArgs,
} from "../arguments.js";
import { ApiResponseError } from "../errors.js";
import {
	loadMutationInput,
	readDataSource as defaultDataSourceReader,
	type DataSourceReader,
} from "../input.js";
import { pageEnvelope } from "../output/contracts.js";

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
const createBodyMeasurementDataSchema = createBodyMeasurementInputSchema.refine(
	(fields) =>
		Object.entries(fields).some(
			([key, value]) => key !== "date" && typeof value === "number",
		),
	"Include at least one numeric measurement field",
);
const updateBodyMeasurementDataSchema = updateBodyMeasurementInputSchema.refine(
	(fields) => Object.keys(fields).some((key) => key !== "date"),
	"Include at least one measurement field",
);

function mutationData(args: CliArgs): string {
	const value = args.options.data;
	if (typeof value !== "string") throw new UsageError("--data is required");
	return value;
}

export async function execute(
	args: CliArgs,
	client: HevyClient,
	now = () => new Date(),
	readDataSource: DataSourceReader = defaultDataSourceReader,
): Promise<unknown> {
	const command = args.command;
	const sub = args.subcommand;
	if (command === "user" && !sub) return { user: await client.getUserInfo() };
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
				workout: await client.getWorkout(workoutId),
			};
		}
		if (sub === "create") {
			requireMutationConfirmation(args);
			const input = await loadMutationInput(
				mutationData(args),
				workoutInputSchema,
				readDataSource,
			);
			const response = await client.createWorkout(input);
			return { workout: response };
		}
		if (sub === "update") {
			requireMutationConfirmation(args);
			const input = await loadMutationInput(
				mutationData(args),
				replaceWorkoutInputSchema,
				readDataSource,
			);
			const workoutId = parseWorkoutId(args.positionals[0]);
			if (input.workout_id !== workoutId)
				throw new UsageError("Workout ID does not match --data.workout_id");
			const response = await client.updateWorkout(workoutId, {
				workout: input.workout,
			});
			return { workout_id: workoutId, workout: response };
		}
		if (sub === "count") {
			const count = body(await client.getWorkoutCount()).workout_count;
			if (typeof count !== "number" || !Number.isInteger(count) || count < 0)
				throw new ApiResponseError("The API returned an invalid workout count");
			return { workout_count: count };
		}
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
				routine: await client.getRoutineById(routineId),
			};
		}
		if (sub === "create") {
			requireMutationConfirmation(args);
			const input = await loadMutationInput(
				mutationData(args),
				createRoutineInputSchema,
				readDataSource,
			);
			const { payload, usesRepRanges } = buildRoutinePayload(
				input.routine,
				"create",
			);
			const response = await client.createRoutine({ routine: payload });
			return { routine: response, uses_rep_ranges: usesRepRanges };
		}
		if (sub === "update") {
			requireMutationConfirmation(args);
			const input = await loadMutationInput(
				mutationData(args),
				updateRoutineInputSchema,
				readDataSource,
			);
			const routineId = parseRoutineId(args.positionals[0]);
			if (input.routine_id !== routineId)
				throw new UsageError("Routine ID does not match --data.routine_id");
			const { payload, usesRepRanges } = buildRoutinePayload(
				input.routine,
				"update",
			);
			const response = await client.updateRoutine(routineId, {
				routine: payload,
			});
			return {
				routine_id: routineId,
				routine: response,
				uses_rep_ranges: usesRepRanges,
			};
		}
	}
	if (command === "exercises") {
		if (sub === "create") {
			requireMutationConfirmation(args);
			const input = await loadMutationInput(
				mutationData(args),
				exerciseTemplateInputSchema,
				readDataSource,
			);
			const response = await client.createExerciseTemplate(input);
			return { exercise_template: response };
		}
		if (sub === "get") {
			const exerciseId = parseExerciseId(args.positionals[0]);
			return {
				exercise_template: await client.getExerciseTemplate(exerciseId),
			};
		}
		if (sub === "history") {
			const exerciseId = parseExerciseHistoryId(args.positionals[0]);
			const options = parseExerciseHistoryOptions(args);
			return {
				exercise_template_id: exerciseId,
				exercise_history:
					(await client.getExerciseHistory(exerciseId, options))
						.exercise_history ?? [],
			};
		}
		if (sub === "search") {
			const query = parseSearchQuery(args.positionals[0]);
			const maxPages = parseSearchMaxPages(args);
			const matches: unknown[] = [];
			let pages_scanned = 0;
			let page_count = 1;
			while (pages_scanned < page_count && pages_scanned < maxPages) {
				const requestedPage = pages_scanned + 1;
				const result = body(
					await client.getExerciseTemplates({
						page: requestedPage,
						pageSize: 100,
					}),
				);
				page_count = result.page_count as number;
				if (
					!Number.isInteger(page_count) ||
					page_count < 0 ||
					(result.page !== undefined && result.page !== requestedPage) ||
					(page_count > 0 && page_count < requestedPage)
				)
					throw new ApiResponseError(
						"The API returned invalid pagination metadata",
					);
				pages_scanned += 1;
				if (page_count === 0) break;
				for (const item of Array.isArray(result.exercise_templates)
					? result.exercise_templates
					: [])
					if (text(body(item).title).toLocaleLowerCase().includes(query))
						matches.push(item);
			}
			return {
				query,
				matches,
				pages_scanned,
				complete: pages_scanned >= page_count,
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
				"body_measurements",
				page,
			);
		}
		if (sub === "get") {
			const date = parseMeasurementDate(args.positionals[0]);
			return {
				body_measurement: await client.getBodyMeasurement(date),
			};
		}
		if (sub === "create") {
			requireMutationConfirmation(args);
			const input = await loadMutationInput(
				mutationData(args),
				createBodyMeasurementDataSchema,
				readDataSource,
			);
			const date = parseMeasurementDate(args.positionals[0] ?? input.date);
			if (input.date !== date)
				throw new UsageError("Measurement date does not match --data.date");
			const { date: _date, ...fields } = input;
			const wireFields = buildMeasurementPayload(fields);
			await client.createBodyMeasurement({ date, ...wireFields });
			return { body_measurement: { date, ...wireFields } };
		}
		if (sub === "update") {
			requireMutationConfirmation(args);
			const input = await loadMutationInput(
				mutationData(args),
				updateBodyMeasurementDataSchema,
				readDataSource,
			);
			const date = parseMeasurementDate(args.positionals[0] ?? input.date);
			if (input.date !== date)
				throw new UsageError("Measurement date does not match --data.date");
			const parsed = existingBodyMeasurementSchema.safeParse(
				await client.getBodyMeasurement(date),
			);
			if (!parsed.success || parsed.data.date !== date)
				throw new ApiResponseError(
					"The API returned an invalid body measurement",
				);
			const { date: _date, ...changes } = input;
			const { payload, measurement } = mergeMeasurementPayload(
				parsed.data,
				changes,
			);
			await client.updateBodyMeasurement(date, payload);
			return { body_measurement: measurement };
		}
	}
	if (command === "folders" && sub === "create") {
		requireMutationConfirmation(args);
		const input = await loadMutationInput(
			mutationData(args),
			routineFolderInputSchema,
			readDataSource,
		);
		const response = await client.createRoutineFolder(input);
		return { routine_folder: response };
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
			start_date: from.toISOString(),
			end_date: to.toISOString(),
			workout_count: workouts.length,
			total_duration_seconds: totalDurationSeconds,
			exercise_count: exerciseCount,
			set_count: setCount,
			total_volume_kg: totalVolumeKg,
			pages_scanned: pagesScanned,
			complete:
				stoppedEarly || pageNumber > pageCount || pagesScanned === pageCount,
		};
	}
	throw new UsageError("Unknown command; run hevy --help");
}
