import type { HevyClient } from "@hevy-mcp/hevy-client";
import { z } from "zod";
import { createOperations, type HevyOperations } from "@hevy-mcp/operations";
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
import {
	pageEnvelope,
	type ApiObject,
	type ApiValue,
} from "../output/contracts.js";

type Body = ApiObject;
function body(value: ApiValue): Body {
	const parsed = z.object({}).passthrough().safeParse(value);
	if (!parsed.success) return {};
	const result: Body = {};
	for (const [key, item] of Object.entries(parsed.data)) {
		const parsedItem = z
			.union([
				z.string(),
				z.number(),
				z.boolean(),
				z.null(),
				z.array(z.unknown()),
			])
			.safeParse(item);
		if (parsedItem.success) result[key] = parsedItem.data as ApiValue;
	}
	return result;
}
function array(value: ApiValue): ApiValue[] {
	return Array.isArray(value) ? value : [];
}
function text(value: ApiValue): string {
	return z.string().safeParse(value).data ?? "";
}
function list(data: Body, source: string, output: string, page: number): Body {
	const count = z.number().safeParse(data.page_count).data;
	if (
		count === undefined ||
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
			([key, value]) => key !== "date" && z.number().safeParse(value).success,
		),
	"Include at least one numeric measurement field",
);
const updateBodyMeasurementDataSchema = updateBodyMeasurementInputSchema.refine(
	(fields) => Object.keys(fields).some((key) => key !== "date"),
	"Include at least one measurement field",
);

function mutationData(args: CliArgs): string {
	const value = args.options.data;
	const parsed = z.string().safeParse(value);
	if (!parsed.success) throw new UsageError("--data is required");
	return parsed.data;
}

type CommandContext = {
	args: CliArgs;
	client: HevyClient;
	now: () => Date;
	readDataSource: DataSourceReader;
	operations: HevyOperations;
};

type CommandResult = Promise<unknown>;

async function executeWorkoutList({
	args,
	operations,
}: CommandContext): Promise<unknown> {
	const { page, pageSize } = parsePagination(args);
	const result = await operations.workouts.list.execute({ page, pageSize });
	if (result.expected404Outcome === "end_of_list")
		return pageEnvelope(
			{ page: result.page, page_count: result.pageCount ?? 0 },
			"workouts",
			result.items,
		);
	return list(
		{
			page: result.page,
			page_count: result.pageCount ?? 0,
			workouts: result.items,
		},
		"workouts",
		"workouts",
		page,
	);
}

async function executeWorkoutGet({ args, client }: CommandContext) {
	const workoutId = parseWorkoutId(args.positionals[0]);
	return { workout: await client.getWorkout(workoutId) };
}

async function executeWorkoutCreate({
	args,
	client,
	readDataSource,
}: CommandContext) {
	requireMutationConfirmation(args);
	const input = await loadMutationInput(
		mutationData(args),
		workoutInputSchema,
		readDataSource,
	);
	return { workout: await client.createWorkout(input) };
}

async function executeWorkoutUpdate({
	args,
	client,
	readDataSource,
}: CommandContext) {
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

async function executeWorkoutCount({ client }: CommandContext) {
	const count = z
		.number()
		.safeParse(body(await client.getWorkoutCount()).workout_count).data;
	if (count === undefined || !Number.isInteger(count) || count < 0)
		throw new ApiResponseError("The API returned an invalid workout count");
	return { workout_count: count };
}

async function executeWorkoutEvents({ args, client }: CommandContext) {
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

function executeWorkouts(context: CommandContext): CommandResult {
	switch (context.args.subcommand) {
		case "list":
			return executeWorkoutList(context);
		case "get":
			return executeWorkoutGet(context);
		case "create":
			return executeWorkoutCreate(context);
		case "update":
			return executeWorkoutUpdate(context);
		case "count":
			return executeWorkoutCount(context);
		case "events":
			return executeWorkoutEvents(context);
		default:
			throw new UsageError("Unknown command; run hevy --help");
	}
}

async function executeRoutineList({
	args,
	operations,
}: CommandContext): Promise<unknown> {
	const { page, pageSize } = parsePagination(
		args,
		getV1RoutinesQueryParamsSchema,
	);
	const result = await operations.routines.list.execute({ page, pageSize });
	if (result.expected404Outcome === "end_of_list")
		return pageEnvelope(
			{ page: result.page, page_count: result.pageCount ?? 0 },
			"routines",
			result.items,
		);
	return list(
		{
			page: result.page,
			page_count: result.pageCount ?? 0,
			routines: result.items,
		},
		"routines",
		"routines",
		page,
	);
}

async function executeRoutineGet({ args, client }: CommandContext) {
	const routineId = parseRoutineId(args.positionals[0]);
	return { routine: await client.getRoutineById(routineId) };
}

async function executeRoutineCreate({
	args,
	client,
	readDataSource,
}: CommandContext) {
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

async function executeRoutineUpdate({
	args,
	client,
	readDataSource,
}: CommandContext) {
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

function executeRoutines(context: CommandContext): CommandResult {
	switch (context.args.subcommand) {
		case "list":
			return executeRoutineList(context);
		case "get":
			return executeRoutineGet(context);
		case "create":
			return executeRoutineCreate(context);
		case "update":
			return executeRoutineUpdate(context);
		default:
			throw new UsageError("Unknown command; run hevy --help");
	}
}

async function executeExerciseCreate({
	args,
	client,
	readDataSource,
}: CommandContext) {
	requireMutationConfirmation(args);
	const input = await loadMutationInput(
		mutationData(args),
		exerciseTemplateInputSchema,
		readDataSource,
	);
	return { exercise_template: await client.createExerciseTemplate(input) };
}

async function executeExerciseGet({ args, client }: CommandContext) {
	const exerciseId = parseExerciseId(args.positionals[0]);
	return { exercise_template: await client.getExerciseTemplate(exerciseId) };
}

async function executeExerciseHistory({ args, client }: CommandContext) {
	const exerciseId = parseExerciseHistoryId(args.positionals[0]);
	const options = parseExerciseHistoryOptions(args);
	return {
		exercise_template_id: exerciseId,
		exercise_history:
			(await client.getExerciseHistory(exerciseId, options)).exercise_history ??
			[],
	};
}

async function executeExerciseSearch({ args, client }: CommandContext) {
	const query = parseSearchQuery(args.positionals[0]);
	const maxPages = parseSearchMaxPages(args);
	const matches: unknown[] = [];
	let pages_scanned = 0;
	let page_count = 1;
	while (pages_scanned < page_count && pages_scanned < maxPages) {
		const requestedPage = pages_scanned + 1;
		const result = body(
			await client.getExerciseTemplates({ page: requestedPage, pageSize: 100 }),
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

function executeExercises(context: CommandContext): CommandResult {
	switch (context.args.subcommand) {
		case "create":
			return executeExerciseCreate(context);
		case "get":
			return executeExerciseGet(context);
		case "history":
			return executeExerciseHistory(context);
		case "search":
			return executeExerciseSearch(context);
		default:
			throw new UsageError("Unknown command; run hevy --help");
	}
}

async function executeMeasurementList({
	args,
	client,
}: CommandContext): Promise<unknown> {
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

async function executeMeasurementGet({ args, client }: CommandContext) {
	const date = parseMeasurementDate(args.positionals[0]);
	return { body_measurement: await client.getBodyMeasurement(date) };
}

async function executeMeasurementCreate({
	args,
	client,
	readDataSource,
}: CommandContext) {
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

async function executeMeasurementUpdate({
	args,
	client,
	readDataSource,
}: CommandContext) {
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
		throw new ApiResponseError("The API returned an invalid body measurement");
	const { date: _date, ...changes } = input;
	const { payload, measurement } = mergeMeasurementPayload(
		parsed.data,
		changes,
	);
	await client.updateBodyMeasurement(date, payload);
	return { body_measurement: measurement };
}

function executeMeasurements(context: CommandContext): CommandResult {
	switch (context.args.subcommand) {
		case "list":
			return executeMeasurementList(context);
		case "get":
			return executeMeasurementGet(context);
		case "create":
			return executeMeasurementCreate(context);
		case "update":
			return executeMeasurementUpdate(context);
		default:
			throw new UsageError("Unknown command; run hevy --help");
	}
}

async function executeFolderCreate({
	args,
	client,
	readDataSource,
}: CommandContext) {
	requireMutationConfirmation(args);
	const input = await loadMutationInput(
		mutationData(args),
		routineFolderInputSchema,
		readDataSource,
	);
	return { routine_folder: await client.createRoutineFolder(input) };
}

async function collectSummaryWorkouts(
	client: HevyClient,
	from: Date,
	to: Date,
) {
	let pageNumber = 1;
	let pageCount = 1;
	let pagesScanned = 0;
	const workouts: Body[] = [];
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
		pageNumber += 1;
	}
	return { workouts, pageNumber, pageCount, pagesScanned };
}

function summarizeWorkouts(workouts: readonly Body[]) {
	let exerciseCount = 0;
	let setCount = 0;
	let totalVolumeKg = 0;
	let totalDurationSeconds = 0;
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
				const weight = z.number().safeParse(item.weight_kg).data;
				const reps = z.number().safeParse(item.reps).data;
				if (weight !== undefined && reps !== undefined)
					totalVolumeKg += weight * reps;
			}
	}
	return { exerciseCount, setCount, totalVolumeKg, totalDurationSeconds };
}

async function executeSummary({ args, client, now }: CommandContext) {
	const weeks = parseWeeks(args);
	const to = now();
	const from = new Date(to.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
	const collection = await collectSummaryWorkouts(client, from, to);
	const totals = summarizeWorkouts(collection.workouts);
	return {
		weeks,
		start_date: from.toISOString(),
		end_date: to.toISOString(),
		workout_count: collection.workouts.length,
		total_duration_seconds: totals.totalDurationSeconds,
		exercise_count: totals.exerciseCount,
		set_count: totals.setCount,
		total_volume_kg: totals.totalVolumeKg,
		pages_scanned: collection.pagesScanned,
		complete: collection.pageNumber > collection.pageCount,
	};
}

export async function execute(
	args: CliArgs,
	client: HevyClient,
	now = () => new Date(),
	readDataSource: DataSourceReader = defaultDataSourceReader,
	operations: HevyOperations = createOperations(client),
): Promise<unknown> {
	const context: CommandContext = {
		args,
		client,
		now,
		readDataSource,
		operations,
	};
	if (args.command === "user" && !args.subcommand)
		return { user: await client.getUserInfo() };
	if (args.command === "workouts") return executeWorkouts(context);
	if (args.command === "routines") return executeRoutines(context);
	if (args.command === "exercises") return executeExercises(context);
	if (args.command === "measurements") return executeMeasurements(context);
	if (args.command === "folders" && args.subcommand === "create")
		return executeFolderCreate(context);
	if (args.command === "summary") return executeSummary(context);
	throw new UsageError("Unknown command; run hevy --help");
}
