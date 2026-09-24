import { getV1RoutinesQueryParamsSchema } from "@hevy-mcp/hevy-client/schemas";
import {
	parsePagination,
	parseRoutineId,
	requireMutationConfirmation,
	UsageError,
} from "../arguments.js";
import { ApiResponseError } from "../errors.js";
import { loadMutationInput } from "../input.js";
import {
	createRoutineInputSchema,
	updateRoutineInputSchema,
} from "@hevy-mcp/operations/schemas";
import { pageEnvelope } from "../output/contracts.js";
import {
	list,
	mutationData,
	runOperation,
	type CommandContext,
	type CommandResult,
} from "./context.js";

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

export function executeRoutines(context: CommandContext): CommandResult {
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
