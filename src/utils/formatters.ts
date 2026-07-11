import type {
	BodyMeasurement,
	ExerciseHistoryEntry,
	ExerciseTemplate,
	Routine,
	RoutineFolder,
	Workout,
} from "../generated/client/types/index.js";
import type {
	FormattedBodyMeasurement,
	FormattedExerciseHistoryEntry,
	FormattedExerciseTemplate,
	FormattedRoutine,
	FormattedRoutineFolder,
	FormattedWorkout,
} from "./output-schemas.js";
import { createSafeErrorDiagnostic } from "./safe-error-diagnostic.js";

export type {
	FormattedBodyMeasurement,
	FormattedExerciseHistoryEntry,
	FormattedExerciseTemplate,
	FormattedRoutine,
	FormattedRoutineExercise,
	FormattedRoutineFolder,
	FormattedRoutineSet,
	FormattedWorkout,
	FormattedWorkoutExercise,
	FormattedWorkoutSet,
} from "./output-schemas.js";

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
 * Format a workout object for consistent presentation
 *
 * @param workout - The workout object from the API
 * @returns A formatted workout object with standardized properties
 */
export function formatWorkout(workout: Workout): FormattedWorkout {
	return {
		id: workout.id,
		title: workout.title,
		description: workout.description,
		startTime: workout.start_time,
		endTime: workout.end_time,
		createdAt: workout.created_at,
		updatedAt: workout.updated_at,
		duration: calculateDuration(workout.start_time, workout.end_time),
		exercises: workout.exercises?.map((exercise) => {
			return {
				index: exercise.index,
				name: exercise.title,
				exerciseTemplateId: exercise.exercise_template_id,
				notes: exercise.notes,
				supersetsId: getSupersetId(exercise),
				sets: exercise.sets?.map((set) => ({
					index: set.index,
					type: set.type,
					weight: set.weight_kg,
					reps: set.reps,
					distance: set.distance_meters,
					duration: set.duration_seconds,
					rpe: set.rpe,
					customMetric: set.custom_metric,
				})),
			};
		}),
	};
}

/**
 * Format a routine object for consistent presentation
 *
 * @param routine - The routine object from the API
 * @returns A formatted routine object with standardized properties
 */
export function formatRoutine(routine: Routine): FormattedRoutine {
	return {
		id: routine.id,
		title: routine.title,
		folderId: routine.folder_id,
		createdAt: routine.created_at,
		updatedAt: routine.updated_at,
		exercises: routine.exercises?.map((exercise) => {
			return {
				name: exercise.title,
				index: exercise.index,
				exerciseTemplateId: exercise.exercise_template_id,
				notes: exercise.notes,
				supersetId: getSupersetId(exercise),
				restSeconds: exercise.rest_seconds,
				sets: exercise.sets?.map((set) => ({
					index: set.index,
					type: set.type,
					weight: set.weight_kg,
					reps: set.reps,
					...(set.rep_range !== undefined && { repRange: set.rep_range }),
					distance: set.distance_meters,
					duration: set.duration_seconds,
					...(set.rpe !== undefined && { rpe: set.rpe }),
					customMetric: set.custom_metric,
				})),
			};
		}),
	};
}

/**
 * Format a routine folder object for consistent presentation
 *
 * @param folder - The routine folder object from the API
 * @returns A formatted routine folder object with standardized properties
 */
export function formatRoutineFolder(
	folder: RoutineFolder,
): FormattedRoutineFolder {
	return {
		id: folder.id,
		title: folder.title,
		createdAt: folder.created_at,
		updatedAt: folder.updated_at,
	};
}

/**
 * Calculate duration between two ISO timestamp strings
 *
 * @param startTime - The start time as ISO string or timestamp
 * @param endTime - The end time as ISO string or timestamp
 * @returns A formatted duration string (e.g. "1h 30m 45s") or "Unknown duration" if inputs are invalid
 */
export function calculateDuration(
	startTime: string | number | null | undefined,
	endTime: string | number | null | undefined,
): string {
	if (!startTime || !endTime) return "Unknown duration";

	try {
		const start = new Date(startTime);
		const end = new Date(endTime);

		// Validate dates
		if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
			return "Unknown duration";
		}

		const durationMs = end.getTime() - start.getTime();

		// Handle negative durations
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

/**
 * Format an exercise template object for consistent presentation
 *
 * @param template - The exercise template object from the API
 * @returns A formatted exercise template object with standardized properties
 */
export function formatExerciseTemplate(
	template: ExerciseTemplate,
): FormattedExerciseTemplate {
	return {
		id: template.id,
		title: template.title,
		type: template.type,
		primaryMuscleGroup: template.primary_muscle_group,
		secondaryMuscleGroups: template.secondary_muscle_groups,
		isCustom: template.is_custom,
	};
}

export function formatExerciseHistoryEntry(
	entry: ExerciseHistoryEntry,
): FormattedExerciseHistoryEntry {
	return {
		workoutId: entry.workout_id,
		workoutTitle: entry.workout_title,
		workoutStartTime: entry.workout_start_time,
		workoutEndTime: entry.workout_end_time,
		exerciseTemplateId: entry.exercise_template_id,
		weight: entry.weight_kg,
		reps: entry.reps,
		distance: entry.distance_meters,
		duration: entry.duration_seconds,
		rpe: entry.rpe,
		customMetric: entry.custom_metric,
		setType: entry.set_type,
	};
}

export function formatBodyMeasurement(
	measurement: BodyMeasurement,
): FormattedBodyMeasurement {
	return {
		date: measurement.date,
		weightKg: measurement.weight_kg ?? null,
		leanMassKg: measurement.lean_mass_kg ?? null,
		fatPercent: measurement.fat_percent ?? null,
		neckCm: measurement.neck_cm ?? null,
		shoulderCm: measurement.shoulder_cm ?? null,
		chestCm: measurement.chest_cm ?? null,
		leftBicepCm: measurement.left_bicep_cm ?? null,
		rightBicepCm: measurement.right_bicep_cm ?? null,
		leftForearmCm: measurement.left_forearm_cm ?? null,
		rightForearmCm: measurement.right_forearm_cm ?? null,
		abdomen: measurement.abdomen ?? null,
		waist: measurement.waist ?? null,
		hips: measurement.hips ?? null,
		leftThigh: measurement.left_thigh ?? null,
		rightThigh: measurement.right_thigh ?? null,
		leftCalf: measurement.left_calf ?? null,
		rightCalf: measurement.right_calf ?? null,
	};
}
