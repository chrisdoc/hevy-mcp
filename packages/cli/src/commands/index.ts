import type { HevyClient, HevyExecutionOptions } from "@hevy-mcp/hevy-client";
import { Effect } from "effect";
import { z } from "zod";
import {
	createOperations,
	mergeMeasurementPayload,
	type HevyOperations,
} from "@hevy-mcp/operations";
import {
	getV1BodyMeasurementsQueryParamsSchema,
	getV1RoutinesQueryParamsSchema,
} from "@hevy-mcp/hevy-client/schemas";
import {
	createBodyMeasurementInputSchema,
	createRoutineInputSchema,
	exerciseTemplateInputSchema,
	existingBodyMeasurementSchema,
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
function list(data: Body, source: string, output: string, page: number): Body {
	const count = z.number().safeParse(data.page_count).data;
	const items = Array.isArray(data[source]) ? data[source] : [];
	if (
		count === undefined ||
		!Number.isSafeInteger(count) ||
		count < 0 ||
		(count === 0 && items.length > 0) ||
		(data.page !== undefined && data.page !== page)
	)
		throw new ApiResponseError("The API returned invalid pagination metadata");
	if (count > 0 && page > count)
		throw new UsageError("Requested page exceeds the API page count");
	return pageEnvelope(data, output, items);
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

function measurementResult(input: Body, date: string): Body {
	const result: Body = { date };
	for (const [key, value] of Object.entries(input)) {
		if (key !== "date" && value !== null && value !== undefined)
			result[key] = value;
	}
	return result;
}

type CommandContext = {
	args: CliArgs;
	client: HevyClient;
	now: () => Date;
	readDataSource: DataSourceReader;
	operations: HevyOperations;
	execution?: HevyExecutionOptions;
};

type CommandResult = Promise<unknown>;
type CliHistoryInput = {
	exerciseTemplateId: string;
	startDate?: string;
	endDate?: string;
};
type CliMeasurementUpdateInput = z.infer<
	typeof updateBodyMeasurementInputSchema
>;

type InputOperation<TInput, TOutput> = {
	readonly effect: (
		input: TInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<TOutput, unknown>;
};

type OptionsOperation<TOutput> = {
	readonly effect: (
		options?: HevyExecutionOptions,
	) => Effect.Effect<TOutput, unknown>;
};

function requireOperation<T>(operation: T | undefined, id: string): T {
	if (operation === undefined)
		throw new ApiResponseError(`Operation ${id} is not configured`);
	return operation;
}

function collapse<T>(effect: Effect.Effect<T, unknown>): Promise<T> {
	return Effect.runPromise(effect);
}

function runOperation<TInput, TOutput>(
	operation: InputOperation<TInput, TOutput> | undefined,
	id: string,
	input: TInput,
	execution: HevyExecutionOptions | undefined,
): Promise<TOutput> {
	const resolved = requireOperation(operation, id);
	return collapse(
		execution === undefined
			? resolved.effect(input)
			: resolved.effect(input, execution),
	);
}

function runOperationWithoutInput<TOutput>(
	operation: OptionsOperation<TOutput> | undefined,
	id: string,
	execution: HevyExecutionOptions | undefined,
): Promise<TOutput> {
	const resolved = requireOperation(operation, id);
	return collapse(
		execution === undefined ? resolved.effect() : resolved.effect(execution),
	);
}

function updateMeasurement(
	operations: HevyOperations,
	date: string,
	input: CliMeasurementUpdateInput,
	execution: HevyExecutionOptions | undefined,
) {
	const getOperation = requireOperation(
		operations.bodyMeasurements?.get,
		"bodyMeasurements.get",
	);
	const updateOperation = requireOperation(
		operations.bodyMeasurements?.update,
		"bodyMeasurements.update",
	);
	const effect = Effect.fn("cli.measurements.update")(function* () {
		const existing =
			execution === undefined
				? yield* getOperation.effect({ date })
				: yield* getOperation.effect({ date }, execution);
		const parsed = existingBodyMeasurementSchema.safeParse(
			existing.bodyMeasurement,
		);
		if (!parsed.success || parsed.data.date !== date) {
			return yield* Effect.fail(
				new ApiResponseError("The API returned an invalid body measurement"),
			);
		}
		const { measurement } = mergeMeasurementPayload(parsed.data, input);
		if (execution === undefined) yield* updateOperation.effect(measurement);
		else yield* updateOperation.effect(measurement, execution);
		return measurement;
	});
	return collapse(effect());
}

async function executeWorkoutList({
	args,
	operations,
	execution,
}: CommandContext): Promise<unknown> {
	const { page, pageSize } = parsePagination(args);
	const result = await runOperation(
		operations.workouts.list,
		"workouts.list",
		{ page, pageSize },
		execution,
	);
	if (result.expected404Outcome === "end_of_list")
		return pageEnvelope(
			{ page: result.page, page_count: result.pageCount ?? 0 },
			"workouts",
			result.items,
		);
	if (result.pageCount === undefined)
		throw new ApiResponseError("The API returned invalid pagination metadata");
	return list(
		{
			page: result.page,
			page_count: result.pageCount,
			workouts: result.items,
		},
		"workouts",
		"workouts",
		page,
	);
}

async function executeWorkoutGet({
	args,
	operations,
	execution,
}: CommandContext) {
	const workoutId = parseWorkoutId(args.positionals[0]);
	const result = await runOperation(
		operations.workouts.get,
		"workouts.get",
		{ workoutId },
		execution,
	);
	return result;
}

async function executeWorkoutCreate({
	args,
	operations,
	readDataSource,
	execution,
}: CommandContext) {
	requireMutationConfirmation(args);
	const input = await loadMutationInput(
		mutationData(args),
		workoutInputSchema,
		readDataSource,
	);
	return {
		workout: await runOperation(
			operations.workouts.create,
			"workouts.create",
			input,
			execution,
		),
	};
}

async function executeWorkoutUpdate({
	args,
	operations,
	readDataSource,
	execution,
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
	const response = await runOperation(
		operations.workouts.update,
		"workouts.update",
		{ workoutId, workout: input.workout },
		execution,
	);
	return { workout_id: workoutId, workout: response };
}

async function executeWorkoutCount({ operations, execution }: CommandContext) {
	const count = await runOperationWithoutInput(
		operations.workouts.count,
		"workouts.count",
		execution,
	);
	if (!Number.isInteger(count) || count < 0)
		throw new ApiResponseError("The API returned an invalid workout count");
	return { workout_count: count };
}

async function executeWorkoutEvents({
	args,
	operations,
	execution,
}: CommandContext) {
	const options = parseWorkoutEventsOptions(args);
	const result = await runOperation(
		operations.workouts.events,
		"workouts.events",
		options,
		execution,
	);
	if (result.expected404Outcome === "end_of_list")
		return {
			...pageEnvelope(
				{ page: result.page, page_count: result.pageCount ?? 0 },
				"events",
				result.events,
			),
			since: result.since,
		};
	if (result.pageCount === undefined)
		throw new ApiResponseError("The API returned invalid pagination metadata");
	return {
		...list(
			{
				page: result.page,
				page_count: result.pageCount,
				events: result.events,
			},
			"events",
			"events",
			options.page,
		),
		since: result.since,
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
	execution,
}: CommandContext): Promise<unknown> {
	const { page, pageSize } = parsePagination(
		args,
		getV1RoutinesQueryParamsSchema,
	);
	const result = await runOperation(
		operations.routines.list,
		"routines.list",
		{ page, pageSize },
		execution,
	);
	if (result.expected404Outcome === "end_of_list")
		return pageEnvelope(
			{ page: result.page, page_count: result.pageCount ?? 0 },
			"routines",
			result.items,
		);
	if (result.pageCount === undefined)
		throw new ApiResponseError("The API returned invalid pagination metadata");
	return list(
		{
			page: result.page,
			page_count: result.pageCount,
			routines: result.items,
		},
		"routines",
		"routines",
		page,
	);
}

async function executeRoutineGet({
	args,
	operations,
	execution,
}: CommandContext) {
	const routineId = parseRoutineId(args.positionals[0]);
	const result = await runOperation(
		operations.routines.get,
		"routines.get",
		{ routineId },
		execution,
	);
	return { routine: { routine: result.routine } };
}

async function executeRoutineCreate({
	args,
	operations,
	readDataSource,
	execution,
}: CommandContext) {
	requireMutationConfirmation(args);
	const input = await loadMutationInput(
		mutationData(args),
		createRoutineInputSchema,
		readDataSource,
	);
	const response = await runOperation(
		operations.routines.create,
		"routines.create",
		input,
		execution,
	);
	return {
		routine: response.routine,
		uses_rep_ranges: response.usesRepRanges,
	};
}

async function executeRoutineUpdate({
	args,
	operations,
	readDataSource,
	execution,
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
	const response = await runOperation(
		operations.routines.update,
		"routines.update",
		{ routineId, routine: input.routine },
		execution,
	);
	return {
		routine_id: routineId,
		routine: response.routine,
		uses_rep_ranges: response.usesRepRanges,
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
	operations,
	readDataSource,
	execution,
}: CommandContext) {
	requireMutationConfirmation(args);
	const input = await loadMutationInput(
		mutationData(args),
		exerciseTemplateInputSchema,
		readDataSource,
	);
	return {
		exercise_template: await runOperation(
			operations.templates?.create,
			"templates.create",
			input,
			execution,
		),
	};
}

async function executeExerciseGet({
	args,
	operations,
	execution,
}: CommandContext) {
	const exerciseId = parseExerciseId(args.positionals[0]);
	const result = await runOperation(
		operations.templates?.get,
		"templates.get",
		{ exerciseTemplateId: exerciseId },
		execution,
	);
	return {
		exercise_template: result.exerciseTemplate,
	};
}

async function executeExerciseHistory({
	args,
	operations,
	execution,
}: CommandContext) {
	const exerciseId = parseExerciseHistoryId(args.positionals[0]);
	const options = parseExerciseHistoryOptions(args);
	const historyInput: CliHistoryInput = {
		exerciseTemplateId: exerciseId,
	};
	if (options.start_date !== undefined)
		historyInput.startDate = options.start_date;
	if (options.end_date !== undefined) historyInput.endDate = options.end_date;
	const result = await runOperation(
		operations.templates?.history,
		"templates.history",
		historyInput,
		execution,
	);
	return {
		exercise_template_id: exerciseId,
		exercise_history: result.exerciseHistory,
	};
}

async function executeExerciseSearch({
	args,
	operations,
	execution,
}: CommandContext) {
	const query = parseSearchQuery(args.positionals[0]);
	const maxPages = parseSearchMaxPages(args);
	const result = await runOperation(
		operations.templates?.search,
		"templates.search",
		{ query, maxPages },
		execution,
	);
	return {
		query,
		matches: result.matches,
		pages_scanned: result.pages,
		complete: result.complete,
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
	operations,
	execution,
}: CommandContext): Promise<unknown> {
	const { page, pageSize } = parsePagination(
		args,
		getV1BodyMeasurementsQueryParamsSchema,
	);
	const result = await runOperation(
		operations.bodyMeasurements?.list,
		"bodyMeasurements.list",
		{ page, pageSize },
		execution,
	);
	if (result.expected404Outcome === "end_of_list")
		return pageEnvelope(
			{ page: result.page, page_count: result.pageCount ?? 0 },
			"body_measurements",
			result.items,
		);
	if (result.pageCount === undefined)
		throw new ApiResponseError("The API returned invalid pagination metadata");
	return list(
		{
			page: result.page,
			page_count: result.pageCount,
			body_measurements: result.items,
		},
		"body_measurements",
		"body_measurements",
		page,
	);
}

async function executeMeasurementGet({
	args,
	operations,
	execution,
}: CommandContext) {
	const date = parseMeasurementDate(args.positionals[0]);
	const result = await runOperation(
		operations.bodyMeasurements?.get,
		"bodyMeasurements.get",
		{ date },
		execution,
	);
	return {
		body_measurement: result.bodyMeasurement,
	};
}

async function executeMeasurementCreate({
	args,
	operations,
	readDataSource,
	execution,
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
	const createdDate = await runOperation(
		operations.bodyMeasurements?.create,
		"bodyMeasurements.create",
		input,
		execution,
	);
	return { body_measurement: measurementResult(body(input), createdDate) };
}

async function executeMeasurementUpdate({
	args,
	operations,
	readDataSource,
	execution,
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
	return {
		body_measurement: await updateMeasurement(
			operations,
			date,
			input,
			execution,
		),
	};
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
	operations,
	readDataSource,
	execution,
}: CommandContext) {
	requireMutationConfirmation(args);
	const input = await loadMutationInput(
		mutationData(args),
		routineFolderInputSchema,
		readDataSource,
	);
	return {
		routine_folder: await runOperation(
			operations.folders?.create,
			"folders.create",
			input,
			execution,
		),
	};
}

async function executeSummary({
	args,
	operations,
	now,
	execution,
}: CommandContext) {
	const weeks = parseWeeks(args);
	const to = now();
	const from = new Date(to.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
	const result = await runOperation(
		operations.workflows?.trainingSummary,
		"workflows.trainingSummary",
		{ weeks },
		execution,
	);
	const totalVolumeKg =
		z
			.number()
			.safeParse(
				(result.workouts as { readonly total_volume_kg?: unknown })
					.total_volume_kg,
			).data ?? 0;
	return {
		weeks,
		start_date: from.toISOString(),
		end_date: to.toISOString(),
		workout_count: result.workouts.count,
		total_duration_seconds: result.workouts.total_duration_seconds,
		exercise_count: result.workouts.exercise_count,
		set_count: result.workouts.set_count,
		total_volume_kg: totalVolumeKg,
		pages_scanned: result.workflow.pagination.workouts,
		complete: true,
	};
}

export async function execute(
	args: CliArgs,
	client: HevyClient,
	now = () => new Date(),
	readDataSource: DataSourceReader = defaultDataSourceReader,
	operations: HevyOperations = createOperations(client, {
		trainingSummaryMaxWeeks: 520,
		trainingSummaryStrictPagination: true,
	}),
	execution?: HevyExecutionOptions,
): Promise<unknown> {
	const context: CommandContext = {
		args,
		client,
		now,
		readDataSource,
		operations,
		execution,
	};
	if (args.command === "user" && !args.subcommand)
		return {
			user: {
				data: await runOperationWithoutInput(
					operations.user?.get,
					"user.get",
					context.execution,
				),
			},
		};
	if (args.command === "workouts") return executeWorkouts(context);
	if (args.command === "routines") return executeRoutines(context);
	if (args.command === "exercises") return executeExercises(context);
	if (args.command === "measurements") return executeMeasurements(context);
	if (args.command === "folders" && args.subcommand === "create")
		return executeFolderCreate(context);
	if (args.command === "summary") return executeSummary(context);
	throw new UsageError("Unknown command; run hevy --help");
}
