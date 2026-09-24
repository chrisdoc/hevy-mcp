import { parseWeeks } from "../arguments.js";
import { runOperation, type CommandContext } from "./context.js";

export async function executeSummary({
	args,
	operations,
	now,
	execution,
}: CommandContext): Promise<unknown> {
	const weeks = parseWeeks(args);
	const to = now();
	const from = new Date(to.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
	const result = await runOperation(
		operations.workflows?.trainingSummary,
		"workflows.trainingSummary",
		{ weeks },
		execution,
	);
	const totalVolumeKg = result.workouts.total_volume_kg ?? 0;
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
