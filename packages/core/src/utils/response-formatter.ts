import type {
	CallToolResult,
	TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { userInfoSchema } from "@hevy-mcp/hevy-client/schemas";

import type {
	BodyMeasurement,
	ExerciseHistoryEntry,
	ExerciseTemplate,
	GetV1WorkoutsEvents200,
	PostV1ExerciseTemplates200,
	Routine,
	RoutineFolder,
	UserInfo,
	Workout,
} from "@hevy-mcp/hevy-client/types";
import { createSafeErrorDiagnostic } from "./safe-error-diagnostic.js";
import {
	attachResultTelemetry,
	bucketCount,
	type ToolResultTelemetry,
} from "./result-telemetry.js";

/**
 * MCP tool response type aligned with MCP SDK CallToolResult while keeping
 * content narrowed to text blocks for this server.
 */
export type McpToolResponse = Omit<CallToolResult, "content"> & {
	content: TextContent[];
};

type OutputShape = z.ZodRawShape;
type OutputFor<TShape extends OutputShape> = z.output<z.ZodObject<TShape>>;

export interface StructuredResponseContract<
	TData,
	TShape extends OutputShape,
> extends ResponseContract<TData> {
	readonly outputSchema: TShape;
}
export interface ResponseContract<TData> {
	render(data: TData): McpToolResponse;
}

interface StructuredContractDefinition<TData, TShape extends OutputShape> {
	readonly outputSchema: TShape;
	readonly normalize: (data: TData) => unknown;
	readonly legacyJson: (output: OutputFor<TShape>) => unknown;
	readonly text?: (
		data: TData,
		output: OutputFor<TShape>,
	) => string | undefined;
	readonly additionalText?: (
		data: TData,
		output: OutputFor<TShape>,
	) => readonly string[];
	readonly telemetry?: (data: TData) => ToolResultTelemetry | undefined;
}

interface JsonContractPresentation {
	readonly json?: unknown;
	readonly text?: string;
	readonly additionalText?: readonly string[];
}

function jsonText(data: unknown): string {
	return JSON.stringify(data, null, 2) ?? "null";
}

function textContent(text: string): TextContent {
	return { type: "text", text };
}

export function defineStructuredResponseContract<
	const TShape extends OutputShape,
	TData,
>(
	definition: StructuredContractDefinition<TData, TShape>,
): StructuredResponseContract<TData, TShape> {
	return {
		outputSchema: definition.outputSchema,
		render(data) {
			const structuredContent = z
				.object(definition.outputSchema)
				.parse(definition.normalize(data));
			const text =
				definition.text?.(data, structuredContent) ??
				jsonText(definition.legacyJson(structuredContent));
			const additionalText =
				definition.additionalText?.(data, structuredContent) ?? [];
			const response: McpToolResponse = {
				content: [textContent(text), ...additionalText.map(textContent)],
				structuredContent,
			};
			attachResultTelemetry(response, definition.telemetry?.(data));
			return response;
		},
	};
}

export function defineJsonResponseContract<TData>(
	present: (data: TData) => JsonContractPresentation,
	telemetry?: (data: TData) => ToolResultTelemetry | undefined,
): ResponseContract<TData> {
	return {
		render(data) {
			const presentation = present(data);
			const text = presentation.text ?? jsonText(presentation.json);
			const response: McpToolResponse = {
				content: [
					textContent(text),
					...(presentation.additionalText ?? []).map(textContent),
				],
			};
			attachResultTelemetry(response, telemetry?.(data));
			return response;
		},
	};
}

/** The only public success-response entry point used by tool handlers. */
export function respond<TData>(
	contract: ResponseContract<TData>,
	data: TData,
): McpToolResponse {
	return contract.render(data);
}

const optionalNullableNumber = z.number().nullable().optional();

export const formattedWorkoutSetSchema = z.object({
	index: z.number().optional(),
	type: z.string().optional(),
	weight: optionalNullableNumber,
	reps: optionalNullableNumber,
	distance: optionalNullableNumber,
	duration: optionalNullableNumber,
	rpe: optionalNullableNumber,
	customMetric: optionalNullableNumber,
});

export const formattedWorkoutExerciseSchema = z.object({
	index: z.number().optional(),
	name: z.string().optional(),
	exerciseTemplateId: z.string().optional(),
	notes: z.string().nullable().optional(),
	supersetsId: optionalNullableNumber,
	sets: z.array(formattedWorkoutSetSchema).optional(),
});

export const formattedWorkoutSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	description: z.string().nullable().optional(),
	startTime: z.union([z.string(), z.number()]).optional(),
	endTime: z.union([z.string(), z.number()]).optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
	duration: z.string(),
	exercises: z.array(formattedWorkoutExerciseSchema).optional(),
});

export const formattedRoutineSetSchema = z.object({
	index: z.number().optional(),
	type: z.string().optional(),
	weight: optionalNullableNumber,
	reps: optionalNullableNumber,
	distance: optionalNullableNumber,
	duration: optionalNullableNumber,
	customMetric: optionalNullableNumber,
	repRange: z
		.object({
			start: z.number().nullable().optional(),
			end: z.number().nullable().optional(),
		})
		.nullable()
		.optional(),
	rpe: optionalNullableNumber,
});

export const formattedRoutineExerciseSchema = z.object({
	name: z.string().optional(),
	index: z.number().optional(),
	exerciseTemplateId: z.string().optional(),
	notes: z.string().nullable().optional(),
	supersetId: optionalNullableNumber,
	restSeconds: z.union([z.string(), z.number()]).nullable().optional(),
	sets: z.array(formattedRoutineSetSchema).optional(),
});

export const formattedRoutineSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	folderId: z.number().nullable().optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
	exercises: z.array(formattedRoutineExerciseSchema).optional(),
});

export const formattedRoutineFolderSchema = z.object({
	id: z.number().optional(),
	title: z.string().optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});

export const formattedExerciseTemplateSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	type: z.string().optional(),
	primaryMuscleGroup: z.string().optional(),
	secondaryMuscleGroups: z.array(z.string()).optional(),
	isCustom: z.boolean().optional(),
});

export const formattedExerciseHistoryEntrySchema = z.object({
	workoutId: z.string().optional(),
	workoutTitle: z.string().optional(),
	workoutStartTime: z.string().optional(),
	workoutEndTime: z.string().optional(),
	exerciseTemplateId: z.string().optional(),
	weight: optionalNullableNumber,
	reps: optionalNullableNumber,
	distance: optionalNullableNumber,
	duration: optionalNullableNumber,
	rpe: optionalNullableNumber,
	customMetric: optionalNullableNumber,
	setType: z.string().optional(),
});

export const formattedBodyMeasurementSchema = z.object({
	date: z.string(),
	weightKg: z.number().nullable(),
	leanMassKg: z.number().nullable(),
	fatPercent: z.number().nullable(),
	neckCm: z.number().nullable(),
	shoulderCm: z.number().nullable(),
	chestCm: z.number().nullable(),
	leftBicepCm: z.number().nullable(),
	rightBicepCm: z.number().nullable(),
	leftForearmCm: z.number().nullable(),
	rightForearmCm: z.number().nullable(),
	abdomen: z.number().nullable(),
	waist: z.number().nullable(),
	hips: z.number().nullable(),
	leftThigh: z.number().nullable(),
	rightThigh: z.number().nullable(),
	leftCalf: z.number().nullable(),
	rightCalf: z.number().nullable(),
});
const workflowTelemetrySchema = z.object({
	name: z.string(),
	pagination: z.record(z.string(), z.number().int().nonnegative()),
	cacheStatus: z.enum(["hit", "miss", "not-used"]),
	itemsScanned: z.number().int().nonnegative(),
});

export const trainingSummarySessionSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	startTime: z.string().optional(),
	endTime: z.string().optional(),
	durationSeconds: z.number().int().nonnegative().nullable(),
	exerciseCount: z.number().int().nonnegative(),
	setCount: z.number().int().nonnegative(),
});

export const compactRoutineSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	folderId: z.number().nullable(),
	updatedAt: z.string().optional(),
	exerciseCount: z.number().int().nonnegative(),
	setCount: z.number().int().nonnegative(),
});

export type WorkflowTelemetry = z.infer<typeof workflowTelemetrySchema>;

export type FormattedWorkoutSet = z.infer<typeof formattedWorkoutSetSchema>;
export type FormattedWorkoutExercise = z.infer<
	typeof formattedWorkoutExerciseSchema
>;
export type FormattedWorkout = z.infer<typeof formattedWorkoutSchema>;
export type FormattedRoutineSet = z.infer<typeof formattedRoutineSetSchema>;
export type FormattedRoutineExercise = z.infer<
	typeof formattedRoutineExerciseSchema
>;
export type FormattedRoutine = z.infer<typeof formattedRoutineSchema>;
export type FormattedRoutineFolder = z.infer<
	typeof formattedRoutineFolderSchema
>;
export type FormattedExerciseTemplate = z.infer<
	typeof formattedExerciseTemplateSchema
>;
export type FormattedExerciseHistoryEntry = z.infer<
	typeof formattedExerciseHistoryEntrySchema
>;
export type FormattedBodyMeasurement = z.infer<
	typeof formattedBodyMeasurementSchema
>;

const workoutsOutputSchema = {
	workouts: z.array(formattedWorkoutSchema),
} as const;
const workoutOutputSchema = {
	workout: formattedWorkoutSchema.nullable(),
} as const;
const workoutCountOutputSchema = { count: z.number().int() } as const;
export const formattedUpdatedWorkoutSchema = z.object({
	type: z.literal("updated"),
	workout: formattedWorkoutSchema,
});

export const formattedDeletedWorkoutSchema = z.object({
	type: z.literal("deleted"),
	id: z.string(),
	deletedAt: z.string().optional(),
});

const workoutEventsOutputSchema = {
	events: z.array(
		z.union([formattedUpdatedWorkoutSchema, formattedDeletedWorkoutSchema]),
	),
} as const;
const routinesOutputSchema = {
	routines: z.array(formattedRoutineSchema),
} as const;
const routineOutputSchema = {
	routine: formattedRoutineSchema.nullable(),
} as const;
const exerciseTemplatesOutputSchema = {
	exerciseTemplates: z.array(formattedExerciseTemplateSchema),
} as const;
const exerciseTemplateOutputSchema = {
	exerciseTemplate: formattedExerciseTemplateSchema.nullable(),
} as const;
const exerciseHistoryOutputSchema = {
	exerciseHistory: z.array(formattedExerciseHistoryEntrySchema),
} as const;
const routineFoldersOutputSchema = {
	routineFolders: z.array(formattedRoutineFolderSchema),
} as const;
const routineFolderOutputSchema = {
	routineFolder: formattedRoutineFolderSchema.nullable(),
} as const;
const bodyMeasurementsOutputSchema = {
	bodyMeasurements: z.array(formattedBodyMeasurementSchema),
} as const;
const bodyMeasurementOutputSchema = {
	bodyMeasurement: formattedBodyMeasurementSchema.nullable(),
} as const;
const userOutputSchema = { user: userInfoSchema.nullable() } as const;
const trainingSummaryOutputSchema = {
	period: z.object({
		startDate: z.string(),
		endDate: z.string(),
		weeks: z.number().int().positive(),
	}),
	workouts: z.object({
		count: z.number().int().nonnegative(),
		totalDurationSeconds: z.number().int().nonnegative(),
		exerciseCount: z.number().int().nonnegative(),
		setCount: z.number().int().nonnegative(),
		uniqueExerciseTemplateIds: z.array(z.string()),
		sessions: z.array(trainingSummarySessionSchema),
	}),
	bodyMeasurements: z.object({
		count: z.number().int().nonnegative(),
		latest: z
			.object({
				date: z.string(),
				weightKg: z.number().nullable(),
				leanMassKg: z.number().nullable(),
				fatPercent: z.number().nullable(),
			})
			.nullable(),
		earliest: z
			.object({
				date: z.string(),
				weightKg: z.number().nullable(),
				leanMassKg: z.number().nullable(),
				fatPercent: z.number().nullable(),
			})
			.nullable(),
		weightChangeKg: z.number().nullable(),
	}),
	workflow: workflowTelemetrySchema,
} as const;
const compactRoutinesOutputSchema = {
	routines: z.array(compactRoutineSchema),
	workflow: workflowTelemetrySchema,
} as const;

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

type WorkoutEvent = GetV1WorkoutsEvents200["events"][number];

function formatWorkoutEvent(event: WorkoutEvent) {
	if (event.type === "updated" && "workout" in event) {
		return { type: "updated" as const, workout: formatWorkout(event.workout) };
	}
	if (event.type === "deleted" && "id" in event) {
		return {
			type: "deleted" as const,
			id: event.id,
			deletedAt: event.deleted_at,
		};
	}
	throw new Error(`Unsupported workout event type: ${event.type}`);
}

function exerciseSetCountTelemetry(
	exercises: readonly { sets?: readonly unknown[] }[],
): Pick<ToolResultTelemetry, "exerciseCountBucket" | "setCountBucket"> {
	const setCount = exercises.reduce(
		(total, exercise) => total + (exercise.sets?.length ?? 0),
		0,
	);
	return {
		exerciseCountBucket: bucketCount(exercises.length),
		setCountBucket: bucketCount(setCount),
	};
}

function workoutResultTelemetry(
	workout: Workout | null | undefined,
): ToolResultTelemetry {
	const exercises = workout?.exercises ?? [];
	return {
		itemCountBucket: bucketCount(workout ? 1 : 0),
		...exerciseSetCountTelemetry(exercises),
	};
}

function routineResultTelemetry(
	routine: Routine | null | undefined,
): ToolResultTelemetry {
	const exercises = routine?.exercises ?? [];
	return {
		itemCountBucket: bucketCount(routine ? 1 : 0),
		...exerciseSetCountTelemetry(exercises),
	};
}

const SAFE_WORKFLOW_NAMES: Record<
	string,
	NonNullable<ToolResultTelemetry["workflow"]>["name"]
> = {
	"training-summary": "training-summary",
	"routine-discovery": "routine-discovery",
};

function workflowResultTelemetry(workflow: {
	name: string;
	pagination: Readonly<Record<string, number>>;
	cacheStatus: "hit" | "miss" | "not-used";
	itemsScanned: number;
}): ToolResultTelemetry["workflow"] {
	const name = SAFE_WORKFLOW_NAMES[workflow.name];
	if (!name) return undefined;
	return {
		name,
		pagination: workflow.pagination,
		cacheStatus: workflow.cacheStatus,
		itemsScanned: workflow.itemsScanned,
	};
}
export const workoutsResponse = defineStructuredResponseContract({
	outputSchema: workoutsOutputSchema,
	normalize: (workouts: readonly Workout[] | undefined) => ({
		workouts: workouts?.map(formatWorkout) ?? [],
	}),
	legacyJson: ({ workouts }) => workouts,
	text: (_data, { workouts }) =>
		workouts.length === 0
			? "No workouts found for the specified parameters"
			: undefined,
	telemetry: (workouts) => ({
		itemCountBucket: bucketCount(workouts?.length ?? 0),
	}),
});

export const workoutResponse = defineStructuredResponseContract({
	outputSchema: workoutOutputSchema,
	normalize: (data: {
		workout: Workout | null | undefined;
		workoutId: string;
	}) => ({ workout: data.workout ? formatWorkout(data.workout) : null }),
	legacyJson: ({ workout }) => workout,
	text: ({ workoutId }, { workout }) =>
		workout === null ? `Workout with ID ${workoutId} not found` : undefined,
	telemetry: ({ workout }) => workoutResultTelemetry(workout),
});

export const workoutCountResponse = defineStructuredResponseContract({
	outputSchema: workoutCountOutputSchema,
	normalize: (count: number) => ({ count }),
	legacyJson: (output) => output,
	telemetry: (count) => ({ itemCountBucket: bucketCount(count) }),
});

export const workoutEventsResponse = defineStructuredResponseContract({
	outputSchema: workoutEventsOutputSchema,
	normalize: (data: {
		events: readonly WorkoutEvent[] | undefined;
		since: string;
	}) => ({ events: data.events?.map(formatWorkoutEvent) ?? [] }),
	legacyJson: ({ events }) => events,
	text: ({ since }, { events }) =>
		events.length === 0
			? `No workout events found for the specified parameters since ${since}`
			: undefined,
	telemetry: (data) => ({
		itemCountBucket: bucketCount(data.events?.length ?? 0),
	}),
});

export const routinesResponse = defineStructuredResponseContract({
	outputSchema: routinesOutputSchema,
	normalize: (routines: readonly Routine[] | undefined) => ({
		routines: routines?.map(formatRoutine) ?? [],
	}),
	legacyJson: ({ routines }) => routines,
	text: (_data, { routines }) =>
		routines.length === 0
			? "No routines found for the specified parameters"
			: undefined,
	telemetry: (routines) => ({
		itemCountBucket: bucketCount(routines?.length ?? 0),
	}),
});

export const routineResponse = defineStructuredResponseContract({
	outputSchema: routineOutputSchema,
	normalize: (data: {
		routine: Routine | null | undefined;
		routineId: string;
	}) => ({ routine: data.routine ? formatRoutine(data.routine) : null }),
	legacyJson: ({ routine }) => routine,
	text: ({ routineId }, { routine }) =>
		routine === null ? `Routine with ID ${routineId} not found` : undefined,
	telemetry: ({ routine }) => routineResultTelemetry(routine),
});

export const exerciseTemplatesResponse = defineStructuredResponseContract({
	outputSchema: exerciseTemplatesOutputSchema,
	normalize: (templates: readonly ExerciseTemplate[] | undefined) => ({
		exerciseTemplates: templates?.map(formatExerciseTemplate) ?? [],
	}),
	legacyJson: ({ exerciseTemplates }) => exerciseTemplates,
	text: (_data, { exerciseTemplates }) =>
		exerciseTemplates.length === 0
			? "No exercise templates found for the specified parameters"
			: undefined,
	telemetry: (templates) => ({
		itemCountBucket: bucketCount(templates?.length ?? 0),
	}),
});

export const exerciseTemplateResponse = defineStructuredResponseContract({
	outputSchema: exerciseTemplateOutputSchema,
	normalize: (data: {
		exerciseTemplate: ExerciseTemplate | null | undefined;
		exerciseTemplateId: string;
	}) => ({
		exerciseTemplate: data.exerciseTemplate
			? formatExerciseTemplate(data.exerciseTemplate)
			: null,
	}),
	legacyJson: ({ exerciseTemplate }) => exerciseTemplate,
	text: ({ exerciseTemplateId }, { exerciseTemplate }) =>
		exerciseTemplate === null
			? `Exercise template with ID ${exerciseTemplateId} not found`
			: undefined,
	telemetry: ({ exerciseTemplate }) => ({
		itemCountBucket: bucketCount(exerciseTemplate ? 1 : 0),
	}),
});

export const exerciseHistoryResponse = defineStructuredResponseContract({
	outputSchema: exerciseHistoryOutputSchema,
	normalize: (data: {
		history: readonly ExerciseHistoryEntry[] | undefined;
		exerciseTemplateId: string;
	}) => ({
		exerciseHistory: data.history?.map(formatExerciseHistoryEntry) ?? [],
	}),
	legacyJson: ({ exerciseHistory }) => exerciseHistory,
	text: ({ exerciseTemplateId }, { exerciseHistory }) =>
		exerciseHistory.length === 0
			? `No exercise history found for template ${exerciseTemplateId}`
			: undefined,
	telemetry: (data) => ({
		itemCountBucket: bucketCount(data.history?.length ?? 0),
	}),
});

export const searchExerciseTemplatesResponse = defineStructuredResponseContract(
	{
		outputSchema: exerciseTemplatesOutputSchema,
		normalize: (data: {
			results: readonly ExerciseTemplate[];
			query: string;
			primaryMuscleGroup?: string;
		}) => ({ exerciseTemplates: data.results.map(formatExerciseTemplate) }),
		legacyJson: ({ exerciseTemplates }) => exerciseTemplates,
		text: ({ query, primaryMuscleGroup }, { exerciseTemplates }) =>
			exerciseTemplates.length === 0
				? `No exercise templates found matching "${query}"${primaryMuscleGroup ? ` with primary muscle group "${primaryMuscleGroup}"` : ""}`
				: undefined,
		telemetry: (data) => ({
			itemCountBucket: bucketCount(data.results.length),
		}),
	},
);

export const routineFoldersResponse = defineStructuredResponseContract({
	outputSchema: routineFoldersOutputSchema,
	normalize: (folders: readonly RoutineFolder[] | undefined) => ({
		routineFolders: folders?.map(formatRoutineFolder) ?? [],
	}),
	legacyJson: ({ routineFolders }) => routineFolders,
	text: (_data, { routineFolders }) =>
		routineFolders.length === 0
			? "No routine folders found for the specified parameters"
			: undefined,
	telemetry: (folders) => ({
		itemCountBucket: bucketCount(folders?.length ?? 0),
	}),
});

export const routineFolderResponse = defineStructuredResponseContract({
	outputSchema: routineFolderOutputSchema,
	normalize: (data: {
		routineFolder: RoutineFolder | null | undefined;
		folderId: string;
	}) => ({
		routineFolder: data.routineFolder
			? formatRoutineFolder(data.routineFolder)
			: null,
	}),
	legacyJson: ({ routineFolder }) => routineFolder,
	text: ({ folderId }, { routineFolder }) =>
		routineFolder === null
			? `Routine folder with ID ${folderId} not found`
			: undefined,
	telemetry: ({ routineFolder }) => ({
		itemCountBucket: bucketCount(routineFolder ? 1 : 0),
	}),
});

export const bodyMeasurementsResponse = defineStructuredResponseContract({
	outputSchema: bodyMeasurementsOutputSchema,
	normalize: (measurements: readonly BodyMeasurement[] | undefined) => ({
		bodyMeasurements: measurements?.map(formatBodyMeasurement) ?? [],
	}),
	legacyJson: ({ bodyMeasurements }) => bodyMeasurements,
	text: (_data, { bodyMeasurements }) =>
		bodyMeasurements.length === 0
			? "No body measurements found for the specified parameters"
			: undefined,
	telemetry: (measurements) => ({
		itemCountBucket: bucketCount(measurements?.length ?? 0),
	}),
});

export const bodyMeasurementResponse = defineStructuredResponseContract({
	outputSchema: bodyMeasurementOutputSchema,
	normalize: (data: {
		bodyMeasurement: BodyMeasurement | null | undefined;
		date: string;
	}) => ({
		bodyMeasurement: data.bodyMeasurement
			? formatBodyMeasurement(data.bodyMeasurement)
			: null,
	}),
	legacyJson: ({ bodyMeasurement }) => bodyMeasurement,
	text: ({ date }, { bodyMeasurement }) =>
		bodyMeasurement === null
			? `No body measurement found for date ${date}`
			: undefined,
	telemetry: ({ bodyMeasurement }) => ({
		itemCountBucket: bucketCount(bodyMeasurement ? 1 : 0),
	}),
});

export const userResponse = defineStructuredResponseContract({
	outputSchema: userOutputSchema,
	normalize: (user: UserInfo | null | undefined) => ({ user: user ?? null }),
	legacyJson: ({ user }) => user,
	text: (_data, { user }) =>
		user === null ? "No user info found for the authenticated user" : undefined,
	telemetry: (user) => ({ itemCountBucket: bucketCount(user ? 1 : 0) }),
});
export type TrainingSummaryResult = z.output<
	z.ZodObject<typeof trainingSummaryOutputSchema>
>;
export type CompactRoutinesResult = z.output<
	z.ZodObject<typeof compactRoutinesOutputSchema>
>;

export const trainingSummaryResponse = defineStructuredResponseContract({
	outputSchema: trainingSummaryOutputSchema,
	normalize: (data: TrainingSummaryResult) => data,
	legacyJson: (output) => output,
	text: (data) =>
		data.workouts.count === 0 && data.bodyMeasurements.count === 0
			? "No workouts or body measurements found for the specified period"
			: undefined,
	telemetry: (data) => ({
		itemCountBucket: bucketCount(
			data.workouts.count + data.bodyMeasurements.count,
		),
		workflow: workflowResultTelemetry(data.workflow),
	}),
});

export const compactRoutinesResponse = defineStructuredResponseContract({
	outputSchema: compactRoutinesOutputSchema,
	normalize: (data: CompactRoutinesResult) => data,
	legacyJson: ({ routines }) => routines,
	text: (_data, { routines }) =>
		routines.length === 0 ? "No routines found matching the query" : undefined,
	telemetry: (data) => ({
		itemCountBucket: bucketCount(data.routines.length),
		workflow: workflowResultTelemetry(data.workflow),
	}),
});

export const createWorkoutResponse = defineJsonResponseContract(
	(workout: Workout | null | undefined) =>
		workout
			? { json: formatWorkout(workout) }
			: { text: "Failed to create workout: Server returned no data" },
	(workout) => workoutResultTelemetry(workout),
);

export const updateWorkoutResponse = defineJsonResponseContract(
	(data: { workout: Workout | null | undefined; workoutId: string }) =>
		data.workout
			? { json: formatWorkout(data.workout) }
			: { text: `Failed to update workout with ID ${data.workoutId}` },
	(data) => workoutResultTelemetry(data.workout),
);

const repRangeDisplayWarningText =
	"Note: Hevy's public API stores rep ranges (rep_range), but the Hevy apps may " +
	"not display them because they rely on an internal-only exercise field " +
	"(input_modifier). See https://github.com/chrisdoc/hevy-mcp/issues/261 for " +
	"details/workarounds.";

export const createRoutineResponse = defineJsonResponseContract(
	(data: { routine: Routine | null | undefined; usesRepRanges: boolean }) =>
		data.routine
			? {
					json: formatRoutine(data.routine),
					additionalText: data.usesRepRanges
						? [repRangeDisplayWarningText]
						: [],
				}
			: { text: "Failed to create routine: Server returned no data" },
	(data) => routineResultTelemetry(data.routine),
);

export const updateRoutineResponse = defineJsonResponseContract(
	(data: {
		routine: Routine | null | undefined;
		routineId: string;
		usesRepRanges: boolean;
	}) =>
		data.routine
			? {
					json: formatRoutine(data.routine),
					additionalText: data.usesRepRanges
						? [repRangeDisplayWarningText]
						: [],
				}
			: { text: `Failed to update routine with ID ${data.routineId}` },
	(data) => routineResultTelemetry(data.routine),
);

export const createExerciseTemplateResponse = defineJsonResponseContract(
	(response: PostV1ExerciseTemplates200 | null | undefined) => ({
		json: {
			id: response?.id,
			message: "Exercise template created successfully",
		},
	}),
);

export const createRoutineFolderResponse = defineJsonResponseContract(
	(folder: RoutineFolder | null | undefined) =>
		folder
			? { json: formatRoutineFolder(folder) }
			: {
					text: "Failed to create routine folder: Server returned no data",
				},
	(folder) => ({ itemCountBucket: bucketCount(folder ? 1 : 0) }),
);

export const createBodyMeasurementResponse = defineJsonResponseContract(
	(date: string) => ({
		text: `Body measurement for ${date} created successfully.`,
	}),
	() => ({ itemCountBucket: "1" }),
);

export const updateBodyMeasurementResponse = defineJsonResponseContract(
	(date: string) => ({
		text: `Body measurement for ${date} updated successfully.`,
	}),
	() => ({ itemCountBucket: "1" }),
);
