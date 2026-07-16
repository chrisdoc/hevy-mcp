import { z } from "zod";
import type { BodyMeasurement } from "../generated/client/types/index.js";
import { parseJsonArray } from "../utils/json-parser.js";
import {
	setTypeEnum,
	utcSecondTimestamp,
	zNullableInt,
	zNullableNumber,
	zOptionalRepRange,
} from "../utils/schemas.js";

export interface PaginationShapeOptions {
	defaultPageSize: number;
	maxPageSize: number;
	integerPage?: boolean;
}

/** Build the page and pageSize fields shared by paginated tools. */
export function paginationShape({
	defaultPageSize,
	maxPageSize,
	integerPage = true,
}: PaginationShapeOptions) {
	const pageNumber = z.coerce.number().gte(1);
	return {
		page: integerPage ? pageNumber.int() : pageNumber,
		pageSize: z.coerce
			.number()
			.int()
			.gte(1)
			.lte(maxPageSize)
			.default(defaultPageSize),
	} as const;
}

export const nonEmptyId = z.string().min(1);

export const calendarDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

export const workoutSetShape = {
	type: setTypeEnum,
	weight: z.coerce.number().optional().nullable(),
	weightKg: z.coerce.number().optional().nullable(),
	reps: z.coerce.number().int().optional().nullable(),
	distance: z.coerce.number().int().optional().nullable(),
	distanceMeters: z.coerce.number().int().optional().nullable(),
	duration: z.coerce.number().int().optional().nullable(),
	durationSeconds: z.coerce.number().int().optional().nullable(),
	rpe: z.coerce.number().optional().nullable(),
	customMetric: z.coerce.number().optional().nullable(),
} as const;

export const workoutExerciseShape = {
	exerciseTemplateId: nonEmptyId,
	supersetId: z.coerce.number().nullable().optional(),
	notes: z.string().optional().nullable(),
	sets: z.array(z.object(workoutSetShape)),
} as const;

export const workoutPayloadShape = {
	title: z.string().min(1),
	description: z.string().optional().nullable(),
	startTime: utcSecondTimestamp,
	endTime: utcSecondTimestamp,
	isPrivate: z.boolean().default(false),
	exercises: z.preprocess(
		parseJsonArray,
		z.array(z.object(workoutExerciseShape)),
	),
} as const;

export const routineSetShape = {
	type: setTypeEnum,
	weight: z.coerce.number().optional(),
	weightKg: z.coerce.number().optional(),
	reps: zNullableInt,
	distance: z.coerce.number().int().optional(),
	distanceMeters: z.coerce.number().int().optional(),
	duration: z.coerce.number().int().optional(),
	durationSeconds: z.coerce.number().int().optional(),
	customMetric: z.coerce.number().optional(),
	repRange: zOptionalRepRange,
} as const;

export const routineExerciseShape = {
	exerciseTemplateId: nonEmptyId,
	supersetId: z.coerce.number().nullable().optional(),
	restSeconds: z.coerce.number().int().min(0).optional(),
	notes: z.string().optional(),
	sets: z.array(z.object(routineSetShape)),
} as const;

export const routinePayloadShape = {
	title: z.string().min(1),
	folderId: z.coerce.number().nullable().optional(),
	notes: z.string().optional(),
	exercises: z.preprocess(
		parseJsonArray,
		z.array(z.object(routineExerciseShape)),
	),
} as const;

export const bodyMeasurementFieldsSchema = {
	weightKg: zNullableNumber.describe("Body weight in kilograms"),
	leanMassKg: zNullableNumber.describe("Lean body mass in kilograms"),
	fatPercent: zNullableNumber.describe("Body fat percentage"),
	neckCm: zNullableNumber.describe("Neck circumference in centimeters"),
	shoulderCm: zNullableNumber.describe("Shoulder circumference in centimeters"),
	chestCm: zNullableNumber.describe("Chest circumference in centimeters"),
	leftBicepCm: zNullableNumber.describe(
		"Left bicep circumference in centimeters",
	),
	rightBicepCm: zNullableNumber.describe(
		"Right bicep circumference in centimeters",
	),
	leftForearmCm: zNullableNumber.describe(
		"Left forearm circumference in centimeters",
	),
	rightForearmCm: zNullableNumber.describe(
		"Right forearm circumference in centimeters",
	),
	abdomen: zNullableNumber.describe("Abdomen circumference in centimeters"),
	waist: zNullableNumber.describe("Waist circumference in centimeters"),
	hips: zNullableNumber.describe("Hips circumference in centimeters"),
	leftThigh: zNullableNumber.describe(
		"Left thigh circumference in centimeters",
	),
	rightThigh: zNullableNumber.describe(
		"Right thigh circumference in centimeters",
	),
	leftCalf: zNullableNumber.describe("Left calf circumference in centimeters"),
	rightCalf: zNullableNumber.describe(
		"Right calf circumference in centimeters",
	),
} as const;

export const measurementFieldToApiKey = {
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
	abdomen: "abdomen",
	waist: "waist",
	hips: "hips",
	leftThigh: "left_thigh",
	rightThigh: "right_thigh",
	leftCalf: "left_calf",
	rightCalf: "right_calf",
} as const satisfies Record<
	keyof typeof bodyMeasurementFieldsSchema,
	keyof Omit<BodyMeasurement, "date">
>;

export type WorkoutSetInput = z.infer<z.ZodObject<typeof workoutSetShape>>;
export type WorkoutExerciseInput = z.infer<
	z.ZodObject<typeof workoutExerciseShape>
>;
export type WorkoutPayloadInput = z.infer<
	z.ZodObject<typeof workoutPayloadShape>
>;
export type RoutineSetInput = z.infer<z.ZodObject<typeof routineSetShape>>;
export type RoutineExerciseInput = z.infer<
	z.ZodObject<typeof routineExerciseShape>
>;
export type RoutinePayloadInput = z.infer<
	z.ZodObject<typeof routinePayloadShape>
>;
export type MeasurementFields = z.infer<
	z.ZodObject<typeof bodyMeasurementFieldsSchema>
>;
