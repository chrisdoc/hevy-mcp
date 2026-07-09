import { z } from "zod";

function coerceNullishNumberInput(value: unknown): unknown {
	if (value === null || value === undefined) {
		return value;
	}

	if (typeof value !== "string") {
		return value;
	}

	const trimmed = value.trim();
	if (trimmed === "") {
		return undefined;
	}

	const lowered = trimmed.toLowerCase();
	if (lowered === "null") {
		return null;
	}
	if (lowered === "undefined") {
		return undefined;
	}

	const asNumber = Number(trimmed);
	if (Number.isNaN(asNumber)) {
		return value;
	}

	return asNumber;
}

export const zNullableInt = z.preprocess(
	coerceNullishNumberInput,
	z.number().int().nullable().optional(),
);

export const zNullableNumber = z.preprocess(
	(value) => (value === "" ? undefined : value),
	z.coerce.number().nullable().optional(),
);

export const zOptionalRepRange = z.preprocess(
	(value) => (value === null ? undefined : value),
	z
		.object({
			start: zNullableInt,
			end: zNullableInt,
		})
		.optional(),
);

const setTypeValues = ["warmup", "normal", "failure", "dropset"] as const;
export const setTypeEnum = z.enum(setTypeValues).default("normal");

const muscleGroupValues = [
	"abdominals",
	"shoulders",
	"biceps",
	"triceps",
	"forearms",
	"quadriceps",
	"hamstrings",
	"calves",
	"glutes",
	"abductors",
	"adductors",
	"lats",
	"upper_back",
	"traps",
	"lower_back",
	"chest",
	"cardio",
	"neck",
	"full_body",
	"other",
] as const;
export const muscleGroupEnum = z.enum(muscleGroupValues);

const exerciseTypeValues = [
	"weight_reps",
	"reps_only",
	"bodyweight_reps",
	"bodyweight_assisted_reps",
	"duration",
	"weight_duration",
	"distance_duration",
	"short_distance_weight",
] as const;
export const exerciseTypeEnum = z.enum(exerciseTypeValues);

const equipmentCategoryValues = [
	"none",
	"barbell",
	"dumbbell",
	"kettlebell",
	"machine",
	"plate",
	"resistance_band",
	"suspension",
	"other",
] as const;
export const equipmentCategoryEnum = z.enum(equipmentCategoryValues);
