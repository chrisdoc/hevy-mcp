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
import { isFiniteNumber, isString } from "../utils/type-predicates.js";
import type { RuntimeValue } from "../utils/type-predicates.js";
import {
	SafeUserError,
	WORKOUT_METADATA_PRIVACY_REQUIRED_ERROR,
} from "../utils/safe-user-error.js";

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
		const reps = isFiniteNumber(set.reps)
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
		const payload: PutRoutinesRequestSet = { ...common, type: set.type };
		if (repRange) payload.rep_range = repRange;
		return payload;
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

const FETCHED_ISO_TIMESTAMP =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/u;

/**
 * Hevy documents ISO 8601 timestamps but can return millisecond or offset
 * variants. Normalize only those explicit-timezone variants before reusing
 * fetched values in the API's second-precision update contract. Caller-
 * supplied values remain strict.
 */
function normalizeFetchedWorkoutTimestamp(value: RuntimeValue): RuntimeValue {
	if (!isString(value)) return value;
	const match = FETCHED_ISO_TIMESTAMP.exec(value);
	if (!match) return value;

	const [, year, month, day, hour, minute, second, offset] = match;
	const numericMonth = Number(month);
	const numericDay = Number(day);
	const numericHour = Number(hour);
	const numericMinute = Number(minute);
	const numericSecond = Number(second);
	const offsetHour = offset === "Z" ? 0 : Number(offset.slice(1, 3));
	const offsetMinute = offset === "Z" ? 0 : Number(offset.slice(4, 6));
	if (
		numericMonth < 1 ||
		numericMonth > 12 ||
		numericDay < 1 ||
		numericDay > 31 ||
		numericHour > 23 ||
		numericMinute > 59 ||
		numericSecond > 59 ||
		offsetHour > 23 ||
		offsetMinute > 59
	) {
		return value;
	}

	const calendarDate = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
	if (
		Number.isNaN(calendarDate.getTime()) ||
		calendarDate.getUTCFullYear() !== Number(year) ||
		calendarDate.getUTCMonth() !== numericMonth - 1 ||
		calendarDate.getUTCDate() !== numericDay
	) {
		return value;
	}

	const timestamp = new Date(value);
	if (Number.isNaN(timestamp.getTime())) return value;
	timestamp.setUTCMilliseconds(0);
	return `${timestamp.toISOString().slice(0, 19)}Z`;
}

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
				exercise.sets?.map((set) => {
					const updateSet: WorkoutUpdateSet = {
						weight_kg: set.weight_kg ?? null,
						reps: set.reps ?? null,
						distance_meters: set.distance_meters ?? null,
						duration_seconds: set.duration_seconds ?? null,
						rpe: set.rpe as WorkoutUpdateSet["rpe"],
						custom_metric: set.custom_metric ?? null,
					};
					if (set.type !== undefined)
						updateSet.type = set.type as WorkoutUpdateSet["type"];
					return updateSet;
				}) ?? [],
		})) ?? []
	);
}

export function buildWorkoutUpdatePayload(
	current: Workout,
	patch: WorkoutMetadataPatchInput,
	replacementExercises?: WorkoutExerciseInput[],
): WorkoutUpdatePayload {
	// When doing a metadata-only update (not replacing exercises), the Hevy API
	// requires is_private in the PUT request, but the GET endpoint does not return it.
	// Therefore, is_private must be explicitly provided for metadata updates.
	const isMetadataOnlyUpdate = replacementExercises === undefined;
	if (isMetadataOnlyUpdate && patch.is_private === undefined) {
		throw new SafeUserError(WORKOUT_METADATA_PRIVACY_REQUIRED_ERROR);
	}

	const metadata = workoutUpdateMetadataSchema.parse({
		title: patch.title !== undefined ? patch.title : current.title,
		start_time:
			patch.start_time !== undefined
				? patch.start_time
				: normalizeFetchedWorkoutTimestamp(current.start_time),
		end_time:
			patch.end_time !== undefined
				? patch.end_time
				: normalizeFetchedWorkoutTimestamp(current.end_time),
	});

	const payload: WorkoutUpdatePayload = {
		...metadata,
		description:
			patch.description !== undefined
				? patch.description
				: (current.description ?? null),
		exercises:
			replacementExercises === undefined
				? preserveWorkoutExercises(current)
				: replacementExercises,
	};
	if (patch.is_private !== undefined) payload.is_private = patch.is_private;
	return payload;
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

export type MeasurementMergeResult = {
	payload: MeasurementPayload;
	measurement: BodyMeasurement;
};

export function mergeMeasurementPayload(
	existing: BodyMeasurement,
	changes: MeasurementFields,
): MeasurementMergeResult {
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
