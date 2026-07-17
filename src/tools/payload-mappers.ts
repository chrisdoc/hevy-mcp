import type {
	BodyMeasurement,
	PostRoutinesRequestBody,
	PostRoutinesRequestSet,
	PostRoutinesRequestSetTypeEnumKey,
	PostWorkoutsRequestBody,
	PostWorkoutsRequestSetRpeEnumKey,
	PostWorkoutsRequestSetTypeEnumKey,
	PutRoutinesRequestBody,
	PutRoutinesRequestSet,
	PutRoutinesRequestSetTypeEnumKey,
} from "../generated/client/types/index.js";
import {
	measurementFieldToApiKey,
	type MeasurementFields,
	type RoutinePayloadInput,
	type WorkoutPayloadInput,
} from "./input-schemas.js";

export type WorkoutPayload = NonNullable<PostWorkoutsRequestBody["workout"]>;

/** Map the public camelCase workout input to the API's snake_case payload. */
export function buildWorkoutPayload(
	input: WorkoutPayloadInput,
): WorkoutPayload {
	return {
		title: input.title,
		description: input.description ?? null,
		start_time: input.startTime,
		end_time: input.endTime,
		is_private: input.isPrivate,
		exercises: input.exercises.map((exercise) => ({
			exercise_template_id: exercise.exerciseTemplateId,
			superset_id: exercise.supersetId ?? null,
			notes: exercise.notes ?? null,
			sets: exercise.sets.map((set) => ({
				type: set.type as PostWorkoutsRequestSetTypeEnumKey,
				weight_kg: set.weight ?? set.weightKg ?? null,
				reps: set.reps ?? null,
				distance_meters: set.distance ?? set.distanceMeters ?? null,
				duration_seconds: set.duration ?? set.durationSeconds ?? null,
				rpe: (set.rpe as PostWorkoutsRequestSetRpeEnumKey | null) ?? null,
				custom_metric: set.customMetric ?? null,
			})),
		})),
	};
}

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
		const repRange = buildRepRange(set.repRange);
		const reps =
			typeof set.reps === "number"
				? set.reps
				: getFixedRepsFromRepRange(repRange);
		const common = {
			weight_kg: set.weight ?? set.weightKg ?? null,
			reps: reps ?? null,
			distance_meters: set.distance ?? set.distanceMeters ?? null,
			duration_seconds: set.duration ?? set.durationSeconds ?? null,
			custom_metric: set.customMetric ?? null,
		};

		if (mode === "create") {
			return {
				...common,
				type: set.type as PostRoutinesRequestSetTypeEnumKey,
				rep_range: repRange,
			};
		}
		return {
			...common,
			type: set.type as PutRoutinesRequestSetTypeEnumKey,
			...(repRange ? { rep_range: repRange } : {}),
		};
	});
}

/**
 * Build a routine wire payload. Create requests explicitly send null rep_range;
 * update requests omit it when no range is supplied.
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
			exercise_template_id: exercise.exerciseTemplateId,
			superset_id: exercise.supersetId ?? null,
			rest_seconds: exercise.restSeconds ?? null,
			notes: exercise.notes ?? null,
			sets,
		};
	});

	if (mode === "create") {
		return {
			payload: {
				title: input.title,
				folder_id: input.folderId ?? null,
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

export type MeasurementPayload = Omit<BodyMeasurement, "date">;

/** Omit nullish measurement values because the API rejects explicit nulls. */
export function buildMeasurementPayload(
	fields: Partial<MeasurementFields>,
): MeasurementPayload {
	const payload: MeasurementPayload = {};
	for (const [camelKey, apiKey] of Object.entries(measurementFieldToApiKey) as [
		keyof MeasurementFields,
		keyof MeasurementPayload,
	][]) {
		const value = fields[camelKey];
		if (value != null) {
			payload[apiKey] = value;
		}
	}
	return payload;
}
