import { z } from "zod";
import type {
	BodyMeasurement,
	PostRoutinesRequestBody,
	PostRoutinesRequestSet,
	PostWorkoutsRequestBody,
	Workout,
	PutRoutinesRequestBody,
	PutRoutinesRequestSet,
} from "@hevy-mcp/hevy-client/types";
import type {
	MeasurementFields,
	RoutinePayloadInput,
	WorkoutExerciseInput,
	WorkoutMetadataPatchInput,
} from "./input-schemas.js";
import { utcSecondTimestamp } from "../utils/schemas.js";

type RoutineRepRange = { start?: number; end?: number } | null;

function buildRepRange(
	repRange: { start?: number | null; end?: number | null } | null | undefined,
): RoutineRepRange {
	if (!repRange) {
		return null;
	}

	const start = repRange.start ?? undefined;
	const end = repRange.end ?? undefined;
	if (start === undefined && end === undefined) {
		return null;
	}

	return { start, end };
}

function getFixedRepsFromRepRange(
	repRange: { start?: number | null; end?: number | null } | null | undefined,
): number | null {
	if (!repRange) {
		return null;
	}
	const start = repRange.start ?? null;
	const end = repRange.end ?? null;
	if (start === null || end === null || start !== end) {
		return null;
	}
	return start;
}

export type RoutineCreatePayload = NonNullable<
	PostRoutinesRequestBody["routine"]
>;
export type RoutineUpdatePayload = NonNullable<
	PutRoutinesRequestBody["routine"]
>;

export type RoutinePayloadResult =
	| { payload: RoutineCreatePayload; usesRepRanges: boolean }
	| { payload: RoutineUpdatePayload; usesRepRanges: boolean };

function buildRoutineSets(
	sets: RoutinePayloadInput["exercises"][number]["sets"],
	mode: "create" | "update",
): PostRoutinesRequestSet[] | PutRoutinesRequestSet[] {
	return sets.map((set) => {
		const repRange = buildRepRange(set.rep_range);
		const reps =
			typeof set.reps === "number"
				? set.reps
				: getFixedRepsFromRepRange(repRange);
		const common = {
			weight_kg: set.weight_kg ?? null,
			reps: reps ?? null,
			distance_meters: set.distance_meters ?? null,
			duration_seconds: set.duration_seconds ?? null,
			custom_metric: set.custom_metric ?? null,
		};

		if (mode === "create") {
			return {
				...common,
				type: set.type,
				rep_range: repRange,
			};
		}
		return {
			...common,
			type: set.type,
			...(repRange ? { rep_range: repRange } : {}),
		};
	});
}

/**
 * Build a routine wire payload while retaining rep-range semantics.
 * Create requests explicitly send null rep_range; update requests omit it
 * when no range is supplied.
 */
export function buildRoutinePayload(
	input: RoutinePayloadInput,
	mode: "create",
): { payload: RoutineCreatePayload; usesRepRanges: boolean };
export function buildRoutinePayload(
	input: RoutinePayloadInput,
	mode: "update",
): { payload: RoutineUpdatePayload; usesRepRanges: boolean };
export function buildRoutinePayload(
	input: RoutinePayloadInput,
	mode: "create" | "update",
): RoutinePayloadResult {
	let usesRepRanges = false;
	const exercises = input.exercises.map((exercise) => {
		const sets = buildRoutineSets(exercise.sets, mode);
		if (
			sets.some(
				(set) =>
					set.rep_range != null &&
					getFixedRepsFromRepRange(set.rep_range) === null,
			)
		) {
			usesRepRanges = true;
		}
		return {
			exercise_template_id: exercise.exercise_template_id,
			superset_id: exercise.superset_id ?? null,
			rest_seconds: exercise.rest_seconds ?? null,
			notes: exercise.notes ?? null,
			sets,
		};
	});

	if (mode === "create") {
		return {
			payload: {
				title: input.title,
				folder_id: input.folder_id ?? null,
				notes: input.notes ?? "",
				exercises: exercises as RoutineCreatePayload["exercises"],
			},
			usesRepRanges,
		};
	}

	return {
		payload: {
			title: input.title,
			notes: input.notes ?? null,
			exercises: exercises as RoutineUpdatePayload["exercises"],
		},
		usesRepRanges,
	};
}

export type WorkoutUpdatePayload = NonNullable<
	PostWorkoutsRequestBody["workout"]
>;
type WorkoutUpdateExercise = NonNullable<
	NonNullable<WorkoutUpdatePayload["exercises"]>[number]
>;
type WorkoutUpdateSet = NonNullable<
	NonNullable<WorkoutUpdateExercise["sets"]>[number]
>;

const workoutUpdateMetadataSchema = z.object({
	title: z.string().min(1),
	start_time: utcSecondTimestamp,
	end_time: utcSecondTimestamp,
});

/**
 * Map fetched API exercises to the update shape without validating legacy data.
 * Caller-supplied replacement exercises are still validated by their input schema.
 */
function preserveWorkoutExercises(
	current: Workout,
): NonNullable<WorkoutUpdatePayload["exercises"]> {
	return (
		current.exercises?.map((exercise) => ({
			exercise_template_id: exercise.exercise_template_id,
			superset_id: exercise.supersets_id ?? null,
			notes: exercise.notes ?? null,
			sets:
				exercise.sets?.map((set) => ({
					...(set.type === undefined
						? {}
						: { type: set.type as WorkoutUpdateSet["type"] }),
					weight_kg: set.weight_kg ?? null,
					reps: set.reps ?? null,
					distance_meters: set.distance_meters ?? null,
					duration_seconds: set.duration_seconds ?? null,
					rpe: set.rpe as WorkoutUpdateSet["rpe"],
					custom_metric: set.custom_metric ?? null,
				})) ?? [],
		})) ?? []
	);
}

export function buildWorkoutUpdatePayload(
	current: Workout,
	patch: WorkoutMetadataPatchInput,
	replacementExercises?: WorkoutExerciseInput[],
): WorkoutUpdatePayload {
	const metadata = workoutUpdateMetadataSchema.parse({
		title: patch.title !== undefined ? patch.title : current.title,
		start_time:
			patch.start_time !== undefined ? patch.start_time : current.start_time,
		end_time: patch.end_time !== undefined ? patch.end_time : current.end_time,
	});

	return {
		...metadata,
		description:
			patch.description !== undefined
				? patch.description
				: (current.description ?? null),
		exercises:
			replacementExercises === undefined
				? preserveWorkoutExercises(current)
				: replacementExercises,
		...(patch.is_private !== undefined ? { is_private: patch.is_private } : {}),
	};
}

export type MeasurementPayload = Omit<BodyMeasurement, "date">;

const measurementKeys = [
	"weight_kg",
	"lean_mass_kg",
	"fat_percent",
	"neck_cm",
	"shoulder_cm",
	"chest_cm",
	"left_bicep_cm",
	"right_bicep_cm",
	"left_forearm_cm",
	"right_forearm_cm",
	"abdomen",
	"waist",
	"hips",
	"left_thigh",
	"right_thigh",
	"left_calf",
	"right_calf",
] as const satisfies readonly (keyof MeasurementPayload)[];

/** Omit nullish measurement values because the API rejects explicit nulls. */
export function buildMeasurementPayload(
	fields: Partial<MeasurementFields>,
): MeasurementPayload {
	const payload: MeasurementPayload = {};
	for (const key of measurementKeys) {
		const value = fields[key];
		if (value != null) {
			payload[key] = value;
		}
	}
	return payload;
}

export function mergeMeasurementPayload(
	existing: BodyMeasurement,
	changes: MeasurementFields,
): { payload: MeasurementPayload; measurement: BodyMeasurement } {
	const payload: MeasurementPayload = {};
	const measurement = { ...existing };

	for (const key of measurementKeys) {
		const changed = changes[key];
		if (changed !== undefined) {
			if (changed !== null) {
				measurement[key] = changed;
				payload[key] = changed;
			}
			continue;
		}
		const existingValue = existing[key];
		if (existingValue != null) payload[key] = existingValue;
	}

	return { payload, measurement };
}
