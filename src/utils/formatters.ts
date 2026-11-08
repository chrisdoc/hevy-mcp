import type {
	BodyMeasurement,
	ExerciseHistoryEntry,
	ExerciseTemplate,
	PutBodyMeasurement,
	Routine,
	RoutineFolder,
	UserInfo,
	Workout,
} from "../generated/client/types/index.js";

/**
 * Formatted workout set interface
 */
export interface FormattedWorkoutSet {
	index: number | undefined;
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
	index: number | undefined;
	name: string | undefined;
	exerciseTemplateId: string | undefined;
	notes: string | undefined | null;
	supersetId: number | undefined | null;
	sets: FormattedWorkoutSet[] | undefined;
}

/**
 * Formatted workout interface
 */
export interface FormattedWorkout {
	id: string | undefined;
	title: string | undefined;
	description: string | undefined | null;
	startTime: string | number | undefined;
	endTime: string | number | undefined;
	createdAt: string | undefined;
	updatedAt: string | undefined;
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
	repRange?: { start?: number | null; end?: number | null } | undefined | null;
	rpe?: number | undefined | null;
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
	restSeconds: number | undefined | null;
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
	equipment: string | undefined;
	thumbnailUrl: string | undefined | null;
}

export interface FormattedExerciseHistoryEntry {
	workoutId: string | undefined;
	workoutTitle: string | undefined;
	workoutStartTime: string | undefined;
	workoutEndTime: string | undefined;
	exerciseTemplateId: string | undefined;
	weight: number | undefined | null;
	reps: number | undefined | null;
	distance: number | undefined | null;
	duration: number | undefined | null;
	rpe: number | undefined | null;
	customMetric: number | undefined | null;
	setType: string | undefined;
}

/**
 * Extract an entity from a mutation response.
 *
 * The Hevy API wraps created/updated entities (e.g. `{ workout: [Workout] }`
 * or `{ routine: Routine }`). The spec has been wrong about response shapes
 * before, so this also accepts a single-element array or the bare entity.
 */
export function unwrapEntity<T extends object>(
	data: unknown,
	key: string,
): T | undefined {
	if (!data || typeof data !== "object") return undefined;
	const value = key in data ? (data as Record<string, unknown>)[key] : data;
	const entity = Array.isArray(value) ? value[0] : value;
	return entity && typeof entity === "object" ? (entity as T) : undefined;
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
				supersetId: exercise.superset_id,
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
				supersetId: exercise.superset_id,
				restSeconds: exercise.rest_seconds,
				sets: exercise.sets?.map((set) => ({
					index: set.index,
					type: set.type,
					weight: set.weight_kg,
					reps: set.reps,
					...(set.rep_range !== undefined && { repRange: set.rep_range }),
					distance: set.distance_meters,
					duration: set.duration_seconds,
					...("rpe" in set &&
						set.rpe !== undefined && { rpe: set.rpe as number | null }),
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
		primaryMuscleGroup: template.primary_muscle_group,
		secondaryMuscleGroups: template.secondary_muscle_groups,
		isCustom: template.is_custom,
		equipment: template.equipment,
		thumbnailUrl: template.thumbnail_url,
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

/**
 * Formatted user info interface
 */
export interface FormattedUserInfo {
	id: string | undefined;
	username: string | undefined;
	name: string | undefined;
	url: string | undefined;
	weightUnit: string | undefined;
	distanceUnit: string | undefined;
	isPro: boolean | undefined;
}

export function formatUserInfo(user: UserInfo): FormattedUserInfo {
	return {
		id: user.id,
		username: user.username,
		name: user.name,
		url: user.url,
		weightUnit: user.weight_unit,
		distanceUnit: user.distance_unit,
		isPro: user.is_pro,
	};
}

/**
 * Mapping between the camelCase body measurement fields used by the tools and
 * the snake_case fields used by the Hevy API. Weights are kg, lengths are cm,
 * fat is a percentage.
 */
export const BODY_MEASUREMENT_FIELDS = {
	weightKg: "weight_kg",
	leanMassKg: "lean_mass_kg",
	fatPercent: "fat_percent",
	neckCm: "neck_cm",
	shoulderCm: "shoulder_cm",
	chestCm: "chest_cm",
	leftBicepCm: "left_bicep_cm",
	rightBicepCm: "right_bicep_cm",
	leftForearmCm: "left_forearm_cm",
	rightForearmCm: "right_forearm_cm",
	abdomenCm: "abdomen",
	waistCm: "waist",
	hipsCm: "hips",
	leftThighCm: "left_thigh",
	rightThighCm: "right_thigh",
	leftCalfCm: "left_calf",
	rightCalfCm: "right_calf",
} as const satisfies Record<string, keyof PutBodyMeasurement>;

export type BodyMeasurementField = keyof typeof BODY_MEASUREMENT_FIELDS;

export type FormattedBodyMeasurement = {
	date: string;
} & { [K in BodyMeasurementField]: number | null | undefined };

export function formatBodyMeasurement(
	measurement: BodyMeasurement,
): FormattedBodyMeasurement {
	const formatted = { date: measurement.date } as FormattedBodyMeasurement;
	for (const [field, apiField] of Object.entries(BODY_MEASUREMENT_FIELDS)) {
		formatted[field as BodyMeasurementField] = measurement[apiField];
	}
	return formatted;
}
