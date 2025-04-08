import type {
	Routine_exercises as Exercise,
	Routine_exercises_sets as ExerciseSet,
	ExerciseTemplate,
	Routine,
	RoutineFolder,
	Workout,
} from "../generated/client/models/index.js";

/**
 * Formatted workout set interface
 */
export interface FormattedWorkoutSet {
	type: string | undefined;
	weight: number | undefined | null;
	reps: number | undefined | null;
	distance: number | undefined | null;
	duration: number | undefined | null;
	rpe: number | undefined | null;
	customMetric: number | undefined | null;
}

/**
 * Formatted workout exercise interface
 */
export interface FormattedWorkoutExercise {
	name: string | undefined;
	notes: string | undefined | null;
	sets: FormattedWorkoutSet[] | undefined;
}

/**
 * Formatted workout interface
 */
export interface FormattedWorkout {
	id: string | undefined;
	date: string | undefined;
	name: string | undefined;
	description: string | undefined | null;
	duration: string;
	exercises: FormattedWorkoutExercise[] | undefined;
}

/**
 * Formatted routine set interface
 */
export interface FormattedRoutineSet {
	index: number | undefined;
	type: string | undefined;
	weight: number | undefined | null;
	reps: number | undefined | null;
	distance: number | undefined | null;
	duration: number | undefined | null;
	customMetric: number | undefined | null;
}

/**
 * Formatted routine exercise interface
 */
export interface FormattedRoutineExercise {
	name: string | undefined;
	index: number | undefined;
	exerciseTemplateId: string | undefined;
	notes: string | undefined | null;
	supersetId: number | undefined | null;
	sets: FormattedRoutineSet[] | undefined;
}

/**
 * Formatted routine interface
 */
export interface FormattedRoutine {
	id: string | undefined;
	title: string | undefined;
	folderId: number | undefined | null;
	createdAt: string | undefined;
	updatedAt: string | undefined;
	exercises: FormattedRoutineExercise[] | undefined;
}

/**
 * Formatted routine folder interface
 */
export interface FormattedRoutineFolder {
	id: number | undefined;
	title: string | undefined;
	createdAt: string | undefined;
	updatedAt: string | undefined;
}

/**
 * Formatted exercise template interface
 */
export interface FormattedExerciseTemplate {
	id: string | undefined;
	title: string | undefined;
	type: string | undefined;
	primaryMuscleGroup: string | undefined;
	secondaryMuscleGroups: string[] | undefined;
	isCustom: boolean | undefined;
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
		date: workout.createdAt,
		name: workout.title,
		description: workout.description,
		duration: calculateDuration(workout.startTime || "", workout.endTime || ""),
		exercises: workout.exercises?.map((exercise: Exercise) => {
			return {
				name: exercise.title,
				notes: exercise.notes,
				sets: exercise.sets?.map((set: ExerciseSet) => ({
					type: set.type,
					weight: set.weightKg,
					reps: set.reps,
					distance: set.distanceMeters,
					duration: set.durationSeconds,
					rpe: set.rpe,
					customMetric: set.customMetric,
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
		folderId: routine.folderId,
		createdAt: routine.createdAt,
		updatedAt: routine.updatedAt,
		exercises: routine.exercises?.map((exercise: Exercise) => {
			return {
				name: exercise.title,
				index: exercise.index,
				exerciseTemplateId: exercise.exerciseTemplateId,
				notes: exercise.notes,
				supersetId: exercise.supersetsId,
				sets: exercise.sets?.map((set: ExerciseSet) => ({
					index: set.index,
					type: set.type,
					weight: set.weightKg,
					reps: set.reps,
					distance: set.distanceMeters,
					duration: set.durationSeconds,
					customMetric: set.customMetric,
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
		createdAt: folder.createdAt,
		updatedAt: folder.updatedAt,
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
		if (isNaN(start.getTime()) || isNaN(end.getTime())) {
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
		console.error("Error calculating duration:", error);
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
		primaryMuscleGroup: template.primaryMuscleGroup,
		secondaryMuscleGroups: template.secondaryMuscleGroups,
		isCustom: template.isCustom,
	};
}
