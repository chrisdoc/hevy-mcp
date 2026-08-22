/**
 * Projections from Hevy API types to the sparse snake_case MCP contract.
 * Pure functions over their input; schemas they fill live in output-schemas.ts.
 */
import type {
	BodyMeasurement,
	ExerciseHistoryEntry,
	Routine,
	RoutineFolder,
	Workout,
} from "@hevy-mcp/hevy-client/types";
import type {
	CompactRoutine,
	FormattedBodyMeasurement,
	FormattedExerciseHistoryEntry,
	FormattedRoutine,
	FormattedRoutineExercise,
	FormattedRoutineFolder,
	FormattedRoutineSet,
	FormattedWorkout,
	FormattedWorkoutExercise,
	FormattedWorkoutSet,
	FormattedWorkoutSummary,
} from "./output-schemas.js";
import { createSafeErrorDiagnostic } from "./error-policy.js";

type ExerciseWithSupersetVariants = {
	supersets_id?: number | null;
	superset_id?: number | null;
};

function getSupersetId(exercise: ExerciseWithSupersetVariants): number | null {
	if (exercise.superset_id !== undefined) {
		return exercise.superset_id;
	}

	if (exercise.supersets_id !== undefined) {
		return exercise.supersets_id;
	}

	return null;
}

/**
 * Project a workout into the sparse snake_case MCP contract.
 */
export function projectWorkout(workout: Workout): FormattedWorkout {
	const result: FormattedWorkout = {
		duration: calculateDuration(workout.start_time, workout.end_time),
	};
	if (workout.id != null) result.id = workout.id;
	if (workout.routine_id != null) result.routine_id = workout.routine_id;
	if (workout.title != null) result.title = workout.title;
	if (workout.description != null) result.description = workout.description;
	if (workout.start_time != null) result.start_time = workout.start_time;
	if (workout.end_time != null) result.end_time = workout.end_time;
	if (workout.created_at != null) result.created_at = workout.created_at;
	if (workout.updated_at != null) result.updated_at = workout.updated_at;
	if (workout.exercises) {
		result.exercises = workout.exercises.map((exercise) => {
			const projected: FormattedWorkoutExercise = {};
			if (exercise.index !== undefined) projected.index = exercise.index;
			if (exercise.title != null) projected.title = exercise.title;
			if (exercise.exercise_template_id != null)
				projected.exercise_template_id = exercise.exercise_template_id;
			if (exercise.notes != null) projected.notes = exercise.notes;
			const supersetId = getSupersetId(exercise);
			if (supersetId != null) projected.supersets_id = supersetId;
			if (exercise.sets)
				projected.sets = exercise.sets.map((set) => {
					const projectedSet: FormattedWorkoutSet = {};
					if (set.index !== undefined) projectedSet.index = set.index;
					if (set.type != null) projectedSet.type = set.type;
					if (set.weight_kg != null) projectedSet.weight_kg = set.weight_kg;
					if (set.reps != null) projectedSet.reps = set.reps;
					if (set.distance_meters != null)
						projectedSet.distance_meters = set.distance_meters;
					if (set.duration_seconds != null)
						projectedSet.duration_seconds = set.duration_seconds;
					if (set.rpe != null) projectedSet.rpe = set.rpe;
					if (set.custom_metric != null)
						projectedSet.custom_metric = set.custom_metric;
					return projectedSet;
				});
			return projected;
		});
	}
	return result;
}

export function summarizeWorkout(workout: Workout): FormattedWorkoutSummary {
	const exercises = workout.exercises ?? [];
	const result: FormattedWorkoutSummary = {
		duration: calculateDuration(workout.start_time, workout.end_time),
		exercise_count: exercises.length,
		set_count: exercises.reduce(
			(total, exercise) => total + (exercise.sets?.length ?? 0),
			0,
		),
	};
	if (workout.id != null) result.id = workout.id;
	if (workout.title != null) result.title = workout.title;
	if (workout.start_time != null) result.start_time = workout.start_time;
	if (workout.end_time != null) result.end_time = workout.end_time;
	return result;
}

export function projectRoutine(routine: Routine): FormattedRoutine {
	const result: FormattedRoutine = {};
	if (routine.id != null) result.id = routine.id;
	if (routine.title != null) result.title = routine.title;
	if (routine.folder_id != null) result.folder_id = routine.folder_id;
	if (routine.created_at != null) result.created_at = routine.created_at;
	if (routine.updated_at != null) result.updated_at = routine.updated_at;
	if (routine.exercises)
		result.exercises = routine.exercises.map((exercise) => {
			const projected: FormattedRoutineExercise = {};
			if (exercise.title != null) projected.title = exercise.title;
			if (exercise.index !== undefined) projected.index = exercise.index;
			if (exercise.exercise_template_id != null)
				projected.exercise_template_id = exercise.exercise_template_id;
			if (exercise.notes != null) projected.notes = exercise.notes;
			const supersetId = getSupersetId(exercise);
			if (supersetId != null) projected.supersets_id = supersetId;
			if (exercise.rest_seconds != null)
				projected.rest_seconds = exercise.rest_seconds;
			if (exercise.sets)
				projected.sets = exercise.sets.map((set) => {
					const projectedSet: FormattedRoutineSet = {};
					if (set.index !== undefined) projectedSet.index = set.index;
					if (set.type != null) projectedSet.type = set.type;
					if (set.weight_kg != null) projectedSet.weight_kg = set.weight_kg;
					if (set.reps != null) projectedSet.reps = set.reps;
					if (set.distance_meters != null)
						projectedSet.distance_meters = set.distance_meters;
					if (set.duration_seconds != null)
						projectedSet.duration_seconds = set.duration_seconds;
					if (set.rpe != null) projectedSet.rpe = set.rpe;
					if (set.custom_metric != null)
						projectedSet.custom_metric = set.custom_metric;
					if (
						set.rep_range &&
						(set.rep_range.start != null || set.rep_range.end != null)
					) {
						const repRange: NonNullable<FormattedRoutineSet["rep_range"]> = {};
						if (set.rep_range.start != null)
							repRange.start = set.rep_range.start;
						if (set.rep_range.end != null) repRange.end = set.rep_range.end;
						projectedSet.rep_range = repRange;
					}
					return projectedSet;
				});
			return projected;
		});
	return result;
}

export function summarizeRoutine(routine: Routine): CompactRoutine {
	const exercises = routine.exercises ?? [];
	const result: CompactRoutine = {
		exercise_count: exercises.length,
		set_count: exercises.reduce(
			(total, exercise) => total + (exercise.sets?.length ?? 0),
			0,
		),
	};
	if (routine.id != null) result.id = routine.id;
	if (routine.title != null) result.title = routine.title;
	if (routine.folder_id != null) result.folder_id = routine.folder_id;
	if (routine.updated_at != null) result.updated_at = routine.updated_at;
	return result;
}

export function projectRoutineFolder(
	folder: RoutineFolder,
): FormattedRoutineFolder {
	return {
		id: folder.id,
		title: folder.title,
		created_at: folder.created_at,
		updated_at: folder.updated_at,
	};
}

export function calculateDuration(
	startTime: string | number | null | undefined,
	endTime: string | number | null | undefined,
): string {
	if (!startTime || !endTime) return "Unknown duration";

	try {
		const start = new Date(startTime);
		const end = new Date(endTime);
		if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
			return "Unknown duration";
		}
		const durationMs = end.getTime() - start.getTime();
		if (durationMs < 0) {
			return "Invalid duration (end time before start time)";
		}
		const hours = Math.floor(durationMs / (1000 * 60 * 60));
		const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
		const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
		return `${hours}h ${minutes}m ${seconds}s`;
	} catch (error) {
		console.error(
			"Error calculating duration",
			createSafeErrorDiagnostic(error),
		);
		return "Unknown duration";
	}
}

export function normalizeExerciseHistoryEntry(
	entry: ExerciseHistoryEntry,
): FormattedExerciseHistoryEntry {
	const result: FormattedExerciseHistoryEntry = {};
	if (entry.workout_id != null) result.workout_id = entry.workout_id;
	if (entry.workout_title != null) result.workout_title = entry.workout_title;
	if (entry.workout_start_time != null)
		result.workout_start_time = entry.workout_start_time;
	if (entry.workout_end_time != null)
		result.workout_end_time = entry.workout_end_time;
	if (entry.exercise_template_id != null)
		result.exercise_template_id = entry.exercise_template_id;
	if (entry.weight_kg != null) result.weight_kg = entry.weight_kg;
	if (entry.reps != null) result.reps = entry.reps;
	if (entry.distance_meters != null)
		result.distance_meters = entry.distance_meters;
	if (entry.duration_seconds != null)
		result.duration_seconds = entry.duration_seconds;
	if (entry.rpe != null) result.rpe = entry.rpe;
	if (entry.custom_metric != null) result.custom_metric = entry.custom_metric;
	if (entry.set_type != null) result.set_type = entry.set_type;
	return result;
}

export function normalizeBodyMeasurement(
	measurement: BodyMeasurement,
): FormattedBodyMeasurement {
	const result: FormattedBodyMeasurement = { date: measurement.date };
	if (measurement.weight_kg != null) result.weight_kg = measurement.weight_kg;
	if (measurement.lean_mass_kg != null)
		result.lean_mass_kg = measurement.lean_mass_kg;
	if (measurement.fat_percent != null)
		result.fat_percent = measurement.fat_percent;
	if (measurement.neck_cm != null) result.neck_cm = measurement.neck_cm;
	if (measurement.shoulder_cm != null)
		result.shoulder_cm = measurement.shoulder_cm;
	if (measurement.chest_cm != null) result.chest_cm = measurement.chest_cm;
	if (measurement.left_bicep_cm != null)
		result.left_bicep_cm = measurement.left_bicep_cm;
	if (measurement.right_bicep_cm != null)
		result.right_bicep_cm = measurement.right_bicep_cm;
	if (measurement.left_forearm_cm != null)
		result.left_forearm_cm = measurement.left_forearm_cm;
	if (measurement.right_forearm_cm != null)
		result.right_forearm_cm = measurement.right_forearm_cm;
	if (measurement.abdomen != null) result.abdomen = measurement.abdomen;
	if (measurement.waist != null) result.waist = measurement.waist;
	if (measurement.hips != null) result.hips = measurement.hips;
	if (measurement.left_thigh != null)
		result.left_thigh_cm = measurement.left_thigh;
	if (measurement.right_thigh != null)
		result.right_thigh_cm = measurement.right_thigh;
	if (measurement.left_calf != null)
		result.left_calf_cm = measurement.left_calf;
	if (measurement.right_calf != null)
		result.right_calf_cm = measurement.right_calf;
	return result;
}
