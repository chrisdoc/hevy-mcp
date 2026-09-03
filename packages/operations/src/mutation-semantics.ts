import { Predicate } from "effect";
import type {
	BodyMeasurement,
	PostRoutinesRequestBody,
	PostRoutinesRequestExercise,
	PostRoutinesRequestSet,
	PostWorkoutsRequestBody,
	PostWorkoutsRequestSet,
	PutRoutinesRequestBody,
	PutRoutinesRequestExercise,
	PutRoutinesRequestSet,
	Workout,
} from "@hevy-mcp/hevy-client/types";
import {
	WorkoutPayloadError,
	WorkoutPrivacyError,
} from "./operation-errors.js";
import { WORKOUT_PUT_REQUIRES_IS_PRIVATE } from "./hevy-quirks.js";

export type RoutineRepRangeInput = {
	readonly start?: number | null;
	readonly end?: number | null;
} | null;

export type RoutineSetInput = {
	readonly type?: PostRoutinesRequestSet["type"];
	readonly weight_kg?: number | null;
	readonly reps?: number | null;
	readonly distance_meters?: number | null;
	readonly duration_seconds?: number | null;
	readonly rep_range?: RoutineRepRangeInput;
	readonly custom_metric?: number | null;
};

export type RoutineExerciseInput = {
	readonly exercise_template_id: string;
	readonly superset_id?: number | null;
	readonly rest_seconds?: number;
	readonly notes?: string;
	readonly sets: RoutineSetInput[];
};

export type RoutinePayloadInput = {
	readonly title: string;
	readonly folder_id?: number | null;
	readonly notes?: string;
	readonly exercises: readonly RoutineExerciseInput[];
};

export type WorkoutSetInput = {
	readonly type?: PostWorkoutsRequestSet["type"];
	readonly weight_kg?: number | null;
	readonly reps?: number | null;
	readonly distance_meters?: number | null;
	readonly duration_seconds?: number | null;
	readonly rpe?: PostWorkoutsRequestSet["rpe"];
	readonly custom_metric?: number | null;
};

export type WorkoutExerciseInput = {
	readonly exercise_template_id: string;
	readonly superset_id?: number | null;
	readonly notes?: string | null;
	readonly sets: WorkoutSetInput[];
};

export type WorkoutMetadataPatchInput = {
	readonly title?: string;
	readonly description?: string | null;
	readonly start_time?: string;
	readonly end_time?: string;
	readonly is_private?: boolean;
};

export type MeasurementKey = Exclude<keyof BodyMeasurement, "date">;
export type MeasurementFields = {
	readonly [Key in MeasurementKey]?: BodyMeasurement[Key];
};

export type RoutineCreatePayload = NonNullable<
	PostRoutinesRequestBody["routine"]
>;
export type RoutineUpdatePayload = NonNullable<
	PutRoutinesRequestBody["routine"]
>;

export type RoutinePayloadResult =
	| { readonly payload: RoutineCreatePayload; readonly usesRepRanges: boolean }
	| { readonly payload: RoutineUpdatePayload; readonly usesRepRanges: boolean };

type RoutineSetPayload = PostRoutinesRequestSet | PutRoutinesRequestSet;

function buildRepRange(
	repRange: RoutineRepRangeInput | undefined,
): RoutineRepRangeInput {
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
	repRange: RoutineRepRangeInput,
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

function isFiniteNumber(value: number | null | undefined): value is number {
	return Predicate.isNumber(value) && Number.isFinite(value);
}

function buildRoutineSets(
	sets: readonly RoutineSetInput[],
	mode: "create" | "update",
): RoutineSetPayload[] {
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
 *
 * Create requests explicitly send null rep_range; update requests omit it
 * when no range is supplied.
 */
export function buildRoutinePayload(
	input: RoutinePayloadInput,
	mode: "create",
): { readonly payload: RoutineCreatePayload; readonly usesRepRanges: boolean };
export function buildRoutinePayload(
	input: RoutinePayloadInput,
	mode: "update",
): { readonly payload: RoutineUpdatePayload; readonly usesRepRanges: boolean };
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
				exercises: exercises as PostRoutinesRequestExercise[],
			},
			usesRepRanges,
		};
	}

	return {
		payload: {
			title: input.title,
			notes: input.notes ?? null,
			exercises: exercises as PutRoutinesRequestExercise[],
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

const STRICT_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const FETCHED_ISO_TIMESTAMP =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/u;

function isStrictUtcTimestamp(value: string | undefined): value is string {
	if (!Predicate.isString(value) || !STRICT_UTC_TIMESTAMP.test(value)) {
		return false;
	}
	const parsed = new Date(value);
	return (
		!Number.isNaN(parsed.getTime()) &&
		parsed.toISOString().replace(".000Z", "Z") === value
	);
}

/**
 * Normalize the timestamp variants returned by Hevy. The update contract is
 * strict UTC seconds, while fetched values may contain milliseconds or an
 * explicit offset. Calendar and clock components are checked before Date is
 * used so lenient parsing cannot turn malformed data into a valid update.
 */
function normalizeFetchedWorkoutTimestamp(value: string | undefined): string {
	if (!Predicate.isString(value)) {
		throw new WorkoutPayloadError({
			message: "The fetched workout metadata contains an invalid timestamp",
		});
	}

	const match = FETCHED_ISO_TIMESTAMP.exec(value);
	if (!match) {
		throw new WorkoutPayloadError({
			message: "The fetched workout metadata contains an invalid timestamp",
		});
	}

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
		throw new WorkoutPayloadError({
			message: "The fetched workout metadata contains an invalid timestamp",
		});
	}

	const calendarDate = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
	if (
		Number.isNaN(calendarDate.getTime()) ||
		calendarDate.getUTCFullYear() !== Number(year) ||
		calendarDate.getUTCMonth() !== numericMonth - 1 ||
		calendarDate.getUTCDate() !== numericDay
	) {
		throw new WorkoutPayloadError({
			message: "The fetched workout metadata contains an invalid timestamp",
		});
	}

	const timestamp = new Date(value);
	if (Number.isNaN(timestamp.getTime())) {
		throw new WorkoutPayloadError({
			message: "The fetched workout metadata contains an invalid timestamp",
		});
	}
	timestamp.setUTCMilliseconds(0);
	return `${timestamp.toISOString().slice(0, 19)}Z`;
}

/**
 * Map fetched API exercises to the update shape without validating legacy
 * data. Caller-supplied replacement exercises are validated by their input
 * schema before this helper is called.
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
					if (set.type !== undefined) {
						updateSet.type = set.type as WorkoutUpdateSet["type"];
					}
					return updateSet;
				}) ?? [],
		})) ?? []
	);
}

/**
 * Build the PUT payload for a workout metadata update or exercise
 * replacement. Metadata-only updates require an explicit privacy value
 * because GET /workouts/:id does not return it.
 */
export function buildWorkoutUpdatePayload(
	current: Workout,
	patch: WorkoutMetadataPatchInput,
	replacementExercises?: WorkoutExerciseInput[],
): WorkoutUpdatePayload {
	const isMetadataOnlyUpdate = replacementExercises === undefined;
	if (isMetadataOnlyUpdate && patch.is_private === undefined) {
		throw new WorkoutPrivacyError({
			message: WORKOUT_PUT_REQUIRES_IS_PRIVATE.error,
		});
	}

	const title = patch.title !== undefined ? patch.title : current.title;
	const startTime =
		patch.start_time !== undefined
			? patch.start_time
			: normalizeFetchedWorkoutTimestamp(current.start_time);
	const endTime =
		patch.end_time !== undefined
			? patch.end_time
			: normalizeFetchedWorkoutTimestamp(current.end_time);
	const description =
		patch.description !== undefined ? patch.description : current.description;

	if (
		!Predicate.isString(title) ||
		title.length < 1 ||
		(description !== undefined &&
			description !== null &&
			!Predicate.isString(description)) ||
		!isStrictUtcTimestamp(startTime) ||
		!isStrictUtcTimestamp(endTime) ||
		(patch.is_private !== undefined && !Predicate.isBoolean(patch.is_private))
	) {
		throw new WorkoutPayloadError({
			message: "The workout metadata is invalid for an update",
		});
	}

	const payload: WorkoutUpdatePayload = {
		title,
		start_time: startTime,
		end_time: endTime,
		exercises:
			replacementExercises === undefined
				? preserveWorkoutExercises(current)
				: replacementExercises,
	};
	if (description !== undefined) payload.description = description;
	if (patch.is_private !== undefined) payload.is_private = patch.is_private;
	return payload;
}

export type MeasurementPayload = Omit<BodyMeasurement, "date">;

export const measurementKeys = [
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
] as const satisfies readonly MeasurementKey[];

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
	readonly payload: MeasurementPayload;
	readonly measurement: BodyMeasurement;
};

/**
 * Merge an update with an existing measurement. Null changes are ignored,
 * because the Hevy API rejects null numeric fields and has no clear operation.
 */
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
