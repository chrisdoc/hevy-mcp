import { z } from "zod";
import type { BodyMeasurement } from "@hevy-mcp/hevy-client/types";
import { parseJsonArray } from "../utils/json-parser.js";
import {
	equipmentCategoryEnum,
	exerciseTypeEnum,
	muscleGroupEnum,
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
export const exerciseTemplateInputShape = {
	title: z.string().min(1),
	exerciseType: exerciseTypeEnum,
	equipmentCategory: equipmentCategoryEnum,
	muscleGroup: muscleGroupEnum,
	otherMuscles: z.array(muscleGroupEnum).default([]),
} as const;

export const routineFolderInputShape = {
	name: z.string().min(1),
} as const;

const CALENDAR_DATE_MESSAGE = "Date must be in YYYY-MM-DD format";
export const calendarDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, CALENDAR_DATE_MESSAGE)
	.refine((value) => {
		const parsed = new Date(`${value}T00:00:00.000Z`);
		return (
			!Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
		);
	}, CALENDAR_DATE_MESSAGE);

export const workoutSetShape = {
	type: setTypeEnum,
	weightKg: z.coerce.number().optional().nullable(),
	reps: z.coerce.number().int().optional().nullable(),
	distanceMeters: z.coerce.number().int().optional().nullable(),
	durationSeconds: z.coerce.number().int().optional().nullable(),
	rpe: z.coerce.number().optional().nullable(),
	customMetric: z.coerce.number().optional().nullable(),
} as const;

export const workoutExerciseShape = {
	exerciseTemplateId: nonEmptyId,
	supersetId: z.coerce.number().nullable().optional(),
	notes: z.string().optional().nullable(),
	sets: z.array(z.object(workoutSetShape).strict()),
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
	weightKg: z.coerce.number().optional(),
	reps: zNullableInt,
	distanceMeters: z.coerce.number().int().optional(),
	durationSeconds: z.coerce.number().int().optional(),
	customMetric: z.coerce.number().optional(),
	repRange: zOptionalRepRange,
} as const;

export const routineExerciseShape = {
	exerciseTemplateId: nonEmptyId,
	supersetId: z.coerce.number().nullable().optional(),
	restSeconds: z.coerce.number().int().min(0).optional(),
	notes: z.string().optional(),
	sets: z.array(z.object(routineSetShape).strict()),
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
	weightKg: zNullableNumber,
	leanMassKg: zNullableNumber,
	fatPercent: zNullableNumber,
	neckCm: zNullableNumber,
	shoulderCm: zNullableNumber,
	chestCm: zNullableNumber,
	leftBicepCm: zNullableNumber,
	rightBicepCm: zNullableNumber,
	leftForearmCm: zNullableNumber,
	rightForearmCm: zNullableNumber,
	abdomen: zNullableNumber.describe("Circumference in centimeters."),
	waist: zNullableNumber.describe("Circumference in centimeters."),
	hips: zNullableNumber.describe("Circumference in centimeters."),
	leftThigh: zNullableNumber,
	rightThigh: zNullableNumber,
	leftCalf: zNullableNumber,
	rightCalf: zNullableNumber,
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
export type ExerciseTemplateInput = z.infer<
	z.ZodObject<typeof exerciseTemplateInputShape>
>;
export type RoutineFolderInput = z.infer<
	z.ZodObject<typeof routineFolderInputShape>
>;
