import {
	parsePagination,
	parseWorkoutEventsOptions,
	parseWorkoutId,
	requireMutationConfirmation,
	UsageError,
} from "../arguments.js";
import { ApiResponseError } from "../errors.js";
import { loadMutationInput } from "../input.js";
import {
	replaceWorkoutInputSchema,
	workoutInputSchema,
} from "@hevy-mcp/operations/schemas";
import { pageEnvelope } from "../output/contracts.js";
import {
	list,
	mutationData,
	runOperation,
	runOperationWithoutInput,
	type CommandContext,
	type CommandResult,
} from "./context.js";

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
	return runOperation(
		operations.workouts.get,
		"workouts.get",
		{ workoutId },
		execution,
	);
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

export function executeWorkouts(context: CommandContext): CommandResult {
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
