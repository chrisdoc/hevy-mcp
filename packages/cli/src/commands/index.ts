import type { HevyClient, HevyExecutionOptions } from "@hevy-mcp/hevy-client";
import { createOperations, type HevyOperations } from "@hevy-mcp/operations";
import { UsageError, type CliArgs } from "../arguments.js";
import type { DataSourceReader } from "../input.js";
import { executeFolderCreate } from "./folders.js";
import { executeMeasurements } from "./measurements.js";
import { executeRoutines } from "./routines.js";
import { executeSummary } from "./summary.js";
import { executeExercises } from "./templates.js";
import { executeUser } from "./user.js";
import { executeWorkouts } from "./workouts.js";
import type { CommandContext } from "./context.js";
import { readDataSource as defaultDataSourceReader } from "../input.js";

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
		now,
		readDataSource,
		operations,
		execution,
	};
	if (args.command === "user" && !args.subcommand) return executeUser(context);
	if (args.command === "workouts") return executeWorkouts(context);
	if (args.command === "routines") return executeRoutines(context);
	if (args.command === "exercises") return executeExercises(context);
	if (args.command === "measurements") return executeMeasurements(context);
	if (args.command === "folders" && args.subcommand === "create")
		return executeFolderCreate(context);
	if (args.command === "summary") return executeSummary(context);
	throw new UsageError("Unknown command; run hevy --help");
}
