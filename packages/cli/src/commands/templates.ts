import { exerciseTemplateInputSchema } from "@hevy-mcp/operations/schemas";
import {
	parseExerciseHistoryId,
	parseExerciseHistoryOptions,
	parseExerciseId,
	parseSearchMaxPages,
	parseSearchQuery,
	requireMutationConfirmation,
	UsageError,
} from "../arguments.js";
import { loadMutationInput } from "../input.js";
import {
	mutationData,
	runOperation,
	type CommandContext,
	type CommandResult,
} from "./context.js";

type CliHistoryInput = {
	exerciseTemplateId: string;
	startDate?: string;
	endDate?: string;
};

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
	return { exercise_template: result.exerciseTemplate };
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

export function executeExercises(context: CommandContext): CommandResult {
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
