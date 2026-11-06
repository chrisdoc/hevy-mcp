import { parseWeeks } from "../arguments.js";
import { runOperation, type CommandContext } from "./context.js";

export async function executeSummary({
	args,
	operations,
	execution,
}: CommandContext): Promise<unknown> {
	const weeks = parseWeeks(args);
	const result = await runOperation(
		operations.workflows?.trainingSummary,
		"workflows.trainingSummary",
		{ weeks },
		execution,
	);
	const totalVolumeKg = result.workouts.total_volume_kg ?? 0;
	return {
		weeks,
		start_date: result.period.start_date,
		end_date: result.period.end_date,
		workout_count: result.workouts.count,
		total_duration_seconds: result.workouts.total_duration_seconds,
		exercise_count: result.workouts.exercise_count,
		set_count: result.workouts.set_count,
		total_volume_kg: totalVolumeKg,
		pages_scanned: result.workflow.pagination.workouts,
		complete: true,
	};
}
