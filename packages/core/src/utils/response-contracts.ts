import type { CallToolResult, TextContent } from "@modelcontextprotocol/server";
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
import type { StructuredExecutionError } from "../execution.js";
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
	errorOutcome?: StructuredExecutionError;
};

type OutputFields = z.ZodRawShape;
type JsonTextValue =
	| string
	| number
	| boolean
	| null
	| readonly JsonTextValue[]
	| { readonly [key: string]: JsonTextValue | undefined };
type OutputFor<TFields extends OutputFields> = z.output<z.ZodObject<TFields>>;

export interface StructuredResponseContract<
	TData,
	TFields extends OutputFields,
> extends ResponseContract<TData> {
	readonly outputSchema: TFields;
}
export interface ResponseContract<TData> {
	render(data: TData): McpToolResponse;
}

interface StructuredContractDefinition<TData, TFields extends OutputFields> {
	readonly outputSchema: TFields;
	readonly normalize: (data: TData) => unknown;
	readonly legacyJson: (output: OutputFor<TFields>) => JsonTextValue;
	readonly text?: (
		data: TData,
		output: OutputFor<TFields>,
	) => string | undefined;
	readonly additionalText?: (
		data: TData,
		output: OutputFor<TFields>,
	) => readonly string[];
	readonly telemetry?: (data: TData) => ToolResultTelemetry | undefined;
}

interface JsonContractPresentation {
	readonly json?: JsonTextValue;
	readonly text?: string;
	readonly additionalText?: readonly string[];
}

function jsonText(data: JsonTextValue): string {
	return JSON.stringify(data, null, 2) ?? "null";
}

function textContent(text: string): TextContent {
	return { type: "text", text };
}

export function defineStructuredResponseContract<
	const TFields extends OutputFields,
	TData,
>(
	definition: StructuredContractDefinition<TData, TFields>,
): StructuredResponseContract<TData, TFields> {
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
			const text = presentation.text ?? jsonText(presentation.json ?? null);
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

const optionalNumber = z.number().optional();

export const formattedWorkoutSetSchema = z.object({
	index: z.number().optional(),
	type: z.string().optional(),
	weight_kg: optionalNumber,
	reps: optionalNumber,
	distance_meters: optionalNumber,
	duration_seconds: optionalNumber,
	rpe: optionalNumber,
	custom_metric: optionalNumber,
});

export const formattedWorkoutExerciseSchema = z.object({
	index: z.number().optional(),
	title: z.string().optional(),
	exercise_template_id: z.string().optional(),
	notes: z.string().optional(),
	supersets_id: optionalNumber,
	sets: z.array(formattedWorkoutSetSchema).optional(),
});

export const formattedWorkoutSchema = z.object({
	id: z.string().optional(),
	routine_id: z.string().optional(),
	title: z.string().optional(),
	description: z.string().optional(),
	start_time: z.string().optional(),
	end_time: z.string().optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
	duration: z.string(),
	exercises: z.array(formattedWorkoutExerciseSchema).optional(),
});

export const formattedRoutineSetSchema = z.object({
	index: z.number().optional(),
	type: z.string().optional(),
	weight_kg: optionalNumber,
	reps: optionalNumber,
	distance_meters: optionalNumber,
	duration_seconds: optionalNumber,
	custom_metric: optionalNumber,
	rep_range: z
		.object({
			start: z.number().optional(),
			end: z.number().optional(),
		})
		.optional(),
	rpe: optionalNumber,
});

export const formattedRoutineExerciseSchema = z.object({
	title: z.string().optional(),
	index: z.number().optional(),
	exercise_template_id: z.string().optional(),
	notes: z.string().optional(),
	supersets_id: optionalNumber,
	rest_seconds: z.number().int().optional(),
	sets: z.array(formattedRoutineSetSchema).optional(),
});

export const formattedRoutineSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	folder_id: z.number().optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
	exercises: z.array(formattedRoutineExerciseSchema).optional(),
});

export const formattedRoutineFolderSchema = z.object({
	id: z.number().optional(),
	title: z.string().optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
});

export const formattedExerciseTemplateSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	type: z.string().optional(),
	primary_muscle_group: z.string().optional(),
	secondary_muscle_groups: z.array(z.string()).optional(),
	is_custom: z.boolean().optional(),
});

export const formattedExerciseHistoryEntrySchema = z.object({
	workout_id: z.string().optional(),
	workout_title: z.string().optional(),
	workout_start_time: z.string().optional(),
	workout_end_time: z.string().optional(),
	exercise_template_id: z.string().optional(),
	weight_kg: optionalNumber,
	reps: optionalNumber,
	distance_meters: optionalNumber,
	duration_seconds: optionalNumber,
	rpe: optionalNumber,
	custom_metric: optionalNumber,
	set_type: z.string().optional(),
});

export const formattedBodyMeasurementSchema = z.object({
	date: z.string(),
	weight_kg: optionalNumber,
	lean_mass_kg: optionalNumber,
	fat_percent: optionalNumber,
	neck_cm: optionalNumber,
	shoulder_cm: optionalNumber,
	chest_cm: optionalNumber,
	left_bicep_cm: optionalNumber,
	right_bicep_cm: optionalNumber,
	left_forearm_cm: optionalNumber,
	right_forearm_cm: optionalNumber,
	abdomen: optionalNumber,
	waist: optionalNumber,
	hips: optionalNumber,
	left_thigh_cm: optionalNumber,
	right_thigh_cm: optionalNumber,
	left_calf_cm: optionalNumber,
	right_calf_cm: optionalNumber,
});
export interface WorkflowTelemetry {
	name: "training-summary" | "routine-discovery";
	pagination: Readonly<Record<string, number>>;
	cacheStatus: "hit" | "miss" | "not-used";
	itemsScanned: number;
}

export const scanSchema = z.object({
	pages: z.record(z.string(), z.number().int().nonnegative()),
	items: z.number().int().nonnegative(),
});

export const trainingSummarySessionSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	start_time: z.string().optional(),
	end_time: z.string().optional(),
	duration_seconds: z.number().int().nonnegative().optional(),
	exercise_count: z.number().int().nonnegative(),
	set_count: z.number().int().nonnegative(),
});

export const compactRoutineSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	folder_id: z.number().optional(),
	updated_at: z.string().optional(),
	exercise_count: z.number().int().nonnegative(),
	set_count: z.number().int().nonnegative(),
});

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

export const formattedWorkoutSummarySchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	start_time: z.string().optional(),
	end_time: z.string().optional(),
	duration: z.string(),
	exercise_count: z.number().int().nonnegative(),
	set_count: z.number().int().nonnegative(),
});
export type FormattedWorkoutSummary = z.infer<
	typeof formattedWorkoutSummarySchema
>;
const paginationOutputSchema = {
	page: z.number().int().positive(),
	page_count: z.number().int().nonnegative().optional(),
	has_next_page: z.boolean().optional(),
} as const;
export type PaginatedToolResult<T> = {
	items: readonly T[];
	page: number;
	pageCount?: number;
	expected404Outcome?: "not_found" | "end_of_list";
};
type PaginatedInput<T> = PaginatedToolResult<T> | readonly T[] | undefined;
function normalizePaginatedInput<T>(
	data: PaginatedInput<T>,
): PaginatedToolResult<T> {
	if (data === undefined) return { items: [], page: 1 };
	if ("items" in data) return data;
	return { items: data, page: 1 };
}

const workoutsOutputSchema = {
	workouts: z.array(formattedWorkoutSummarySchema),
	...paginationOutputSchema,
} as const;
const workoutOutputSchema = {
	workout: formattedWorkoutSchema.nullable(),
} as const;
const workoutCountOutputSchema = { workout_count: z.number().int() } as const;
export const formattedUpdatedWorkoutSchema = z.object({
	type: z.literal("updated"),
	workout: formattedWorkoutSchema,
});
export const formattedDeletedWorkoutSchema = z.object({
	type: z.literal("deleted"),
	id: z.string(),
	deleted_at: z.string().optional(),
});
const workoutEventsOutputSchema = {
	events: z.array(
		z.union([formattedUpdatedWorkoutSchema, formattedDeletedWorkoutSchema]),
	),
	...paginationOutputSchema,
} as const;
const routinesOutputSchema = {
	routines: z.array(compactRoutineSchema),
	...paginationOutputSchema,
} as const;
const routineOutputSchema = {
	routine: formattedRoutineSchema.nullable(),
} as const;
const exerciseTemplatesOutputSchema = {
	exercise_templates: z.array(formattedExerciseTemplateSchema),
	...paginationOutputSchema,
} as const;
const exerciseTemplateSearchOutputSchema = {
	exercise_templates: z.array(formattedExerciseTemplateSchema),
} as const;
const exerciseTemplateOutputSchema = {
	exercise_template: formattedExerciseTemplateSchema.nullable(),
} as const;
const exerciseHistoryOutputSchema = {
	exercise_history: z.array(formattedExerciseHistoryEntrySchema),
} as const;
const routineFoldersOutputSchema = {
	routine_folders: z.array(formattedRoutineFolderSchema),
	...paginationOutputSchema,
} as const;
const routineFolderOutputSchema = {
	routine_folder: formattedRoutineFolderSchema.nullable(),
} as const;
const bodyMeasurementsOutputSchema = {
	body_measurements: z.array(formattedBodyMeasurementSchema),
	...paginationOutputSchema,
} as const;
const bodyMeasurementOutputSchema = {
	body_measurement: formattedBodyMeasurementSchema.nullable(),
} as const;
const userOutputSchema = { user: userInfoSchema.nullable() } as const;
const trainingSummaryOutputSchema = {
	period: z.object({
		start_date: z.string(),
		end_date: z.string(),
		weeks: z.number().int().positive(),
	}),
	workouts: z.object({
		count: z.number().int().nonnegative(),
		total_duration_seconds: z.number().int().nonnegative(),
		exercise_count: z.number().int().nonnegative(),
		set_count: z.number().int().nonnegative(),
		unique_exercise_template_ids: z.array(z.string()),
		sessions: z.array(trainingSummarySessionSchema),
	}),
	body_measurements: z.object({
		count: z.number().int().nonnegative(),
		latest: z
			.object({
				date: z.string(),
				weight_kg: optionalNumber,
				lean_mass_kg: optionalNumber,
				fat_percent: optionalNumber,
			})
			.optional(),
		earliest: z
			.object({
				date: z.string(),
				weight_kg: optionalNumber,
				lean_mass_kg: optionalNumber,
				fat_percent: optionalNumber,
			})
			.optional(),
		weight_change_kg: optionalNumber,
	}),
	scan: scanSchema,
} as const;
const compactRoutinesOutputSchema = {
	routines: z.array(compactRoutineSchema),
	scan: scanSchema,
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
 * Project a workout into the sparse snake_case MCP contract.
 */
export function projectWorkout(workout: Workout): FormattedWorkout {
	const result: FormattedWorkout = { duration: calculateDuration(workout.start_time, workout.end_time) };
	if (workout.id != null) result.id = workout.id;
	if (workout.routine_id != null) result.routine_id = workout.routine_id;
	if (workout.title != null) result.title = workout.title;
	if (workout.description != null) result.description = workout.description;
	if (workout.start_time != null) result.start_time = workout.start_time;
	if (workout.end_time != null) result.end_time = workout.end_time;
	if (workout.created_at != null) result.created_at = workout.created_at;
	if (workout.updated_at != null) result.updated_at = workout.updated_at;
	if (workout.exercises) {
		result.exercises = workout.exercises.map((exercise) => {
			const projected: FormattedWorkoutExercise = {};
			if (exercise.index !== undefined) projected.index = exercise.index;
			if (exercise.title != null) projected.title = exercise.title;
			if (exercise.exercise_template_id != null) projected.exercise_template_id = exercise.exercise_template_id;
			if (exercise.notes != null) projected.notes = exercise.notes;
			const supersetId = getSupersetId(exercise);
			if (supersetId != null) projected.supersets_id = supersetId;
			if (exercise.sets) projected.sets = exercise.sets.map((set) => {
				const projectedSet: FormattedWorkoutSet = {};
				if (set.index !== undefined) projectedSet.index = set.index;
				if (set.type != null) projectedSet.type = set.type;
				if (set.weight_kg != null) projectedSet.weight_kg = set.weight_kg;
				if (set.reps != null) projectedSet.reps = set.reps;
				if (set.distance_meters != null) projectedSet.distance_meters = set.distance_meters;
				if (set.duration_seconds != null) projectedSet.duration_seconds = set.duration_seconds;
				if (set.rpe != null) projectedSet.rpe = set.rpe;
				if (set.custom_metric != null) projectedSet.custom_metric = set.custom_metric;
				return projectedSet;
			});
			return projected;
		});
	}
	return result;
}

export function summarizeWorkout(workout: Workout): FormattedWorkoutSummary {
	const exercises = workout.exercises ?? [];
	const result: FormattedWorkoutSummary = {
		duration: calculateDuration(workout.start_time, workout.end_time),
		exercise_count: exercises.length,
		set_count: exercises.reduce((total, exercise) => total + (exercise.sets?.length ?? 0), 0),
	};
	if (workout.id != null) result.id = workout.id;
	if (workout.title != null) result.title = workout.title;
	if (workout.start_time != null) result.start_time = workout.start_time;
	if (workout.end_time != null) result.end_time = workout.end_time;
	return result;
}

export function projectRoutine(routine: Routine): FormattedRoutine {
	const result: FormattedRoutine = {};
	if (routine.id != null) result.id = routine.id;
	if (routine.title != null) result.title = routine.title;
	if (routine.folder_id != null) result.folder_id = routine.folder_id;
	if (routine.created_at != null) result.created_at = routine.created_at;
	if (routine.updated_at != null) result.updated_at = routine.updated_at;
	if (routine.exercises) result.exercises = routine.exercises.map((exercise) => {
		const projected: FormattedRoutineExercise = {};
		if (exercise.title != null) projected.title = exercise.title;
		if (exercise.index !== undefined) projected.index = exercise.index;
		if (exercise.exercise_template_id != null) projected.exercise_template_id = exercise.exercise_template_id;
		if (exercise.notes != null) projected.notes = exercise.notes;
		const supersetId = getSupersetId(exercise);
		if (supersetId != null) projected.supersets_id = supersetId;
		if (exercise.rest_seconds != null) projected.rest_seconds = exercise.rest_seconds;
		if (exercise.sets) projected.sets = exercise.sets.map((set) => {
			const projectedSet: FormattedRoutineSet = {};
			if (set.index !== undefined) projectedSet.index = set.index;
			if (set.type != null) projectedSet.type = set.type;
			if (set.weight_kg != null) projectedSet.weight_kg = set.weight_kg;
			if (set.reps != null) projectedSet.reps = set.reps;
			if (set.distance_meters != null) projectedSet.distance_meters = set.distance_meters;
			if (set.duration_seconds != null) projectedSet.duration_seconds = set.duration_seconds;
			if (set.rpe != null) projectedSet.rpe = set.rpe;
			if (set.custom_metric != null) projectedSet.custom_metric = set.custom_metric;
			if (set.rep_range && (set.rep_range.start != null || set.rep_range.end != null)) {
				const repRange: NonNullable<FormattedRoutineSet['rep_range']> = {};
				if (set.rep_range.start != null) repRange.start = set.rep_range.start;
				if (set.rep_range.end != null) repRange.end = set.rep_range.end;
				projectedSet.rep_range = repRange;
			}
			return projectedSet;
		});
		return projected;
	});
	return result;
}

export function summarizeRoutine(
	routine: Routine,
): z.output<typeof compactRoutineSchema> {
	const exercises = routine.exercises ?? [];
	const result: z.output<typeof compactRoutineSchema> = {
		exercise_count: exercises.length,
		set_count: exercises.reduce(
			(total, exercise) => total + (exercise.sets?.length ?? 0),
			0,
		),
	};
	if (routine.id != null) result.id = routine.id;
	if (routine.title != null) result.title = routine.title;
	if (routine.folder_id != null) result.folder_id = routine.folder_id;
	if (routine.updated_at != null) result.updated_at = routine.updated_at;
	return result;
}

export function projectRoutineFolder(
	folder: RoutineFolder,
): FormattedRoutineFolder {
	return {
		id: folder.id,
		title: folder.title,
		created_at: folder.created_at,
		updated_at: folder.updated_at,
	};
}

export function calculateDuration(
	startTime: string | number | null | undefined,
	endTime: string | number | null | undefined,
): string {
	if (!startTime || !endTime) return "Unknown duration";

	try {
		const start = new Date(startTime);
		const end = new Date(endTime);
		if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
			return "Unknown duration";
		}
		const durationMs = end.getTime() - start.getTime();
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

export function normalizeExerciseHistoryEntry(entry: ExerciseHistoryEntry): FormattedExerciseHistoryEntry {
	const result: FormattedExerciseHistoryEntry = {};
	if (entry.workout_id != null) result.workout_id = entry.workout_id;
	if (entry.workout_title != null) result.workout_title = entry.workout_title;
	if (entry.workout_start_time != null) result.workout_start_time = entry.workout_start_time;
	if (entry.workout_end_time != null) result.workout_end_time = entry.workout_end_time;
	if (entry.exercise_template_id != null) result.exercise_template_id = entry.exercise_template_id;
	if (entry.weight_kg != null) result.weight_kg = entry.weight_kg;
	if (entry.reps != null) result.reps = entry.reps;
	if (entry.distance_meters != null) result.distance_meters = entry.distance_meters;
	if (entry.duration_seconds != null) result.duration_seconds = entry.duration_seconds;
	if (entry.rpe != null) result.rpe = entry.rpe;
	if (entry.custom_metric != null) result.custom_metric = entry.custom_metric;
	if (entry.set_type != null) result.set_type = entry.set_type;
	return result;
}

export function normalizeBodyMeasurement(measurement: BodyMeasurement): FormattedBodyMeasurement {
	const result: FormattedBodyMeasurement = { date: measurement.date };
	if (measurement.weight_kg != null) result.weight_kg = measurement.weight_kg;
	if (measurement.lean_mass_kg != null) result.lean_mass_kg = measurement.lean_mass_kg;
	if (measurement.fat_percent != null) result.fat_percent = measurement.fat_percent;
	if (measurement.neck_cm != null) result.neck_cm = measurement.neck_cm;
	if (measurement.shoulder_cm != null) result.shoulder_cm = measurement.shoulder_cm;
	if (measurement.chest_cm != null) result.chest_cm = measurement.chest_cm;
	if (measurement.left_bicep_cm != null) result.left_bicep_cm = measurement.left_bicep_cm;
	if (measurement.right_bicep_cm != null) result.right_bicep_cm = measurement.right_bicep_cm;
	if (measurement.left_forearm_cm != null) result.left_forearm_cm = measurement.left_forearm_cm;
	if (measurement.right_forearm_cm != null) result.right_forearm_cm = measurement.right_forearm_cm;
	if (measurement.abdomen != null) result.abdomen = measurement.abdomen;
	if (measurement.waist != null) result.waist = measurement.waist;
	if (measurement.hips != null) result.hips = measurement.hips;
	if (measurement.left_thigh != null) result.left_thigh_cm = measurement.left_thigh;
	if (measurement.right_thigh != null) result.right_thigh_cm = measurement.right_thigh;
	if (measurement.left_calf != null) result.left_calf_cm = measurement.left_calf;
	if (measurement.right_calf != null) result.right_calf_cm = measurement.right_calf;
	return result;
}

type WorkoutEvent = GetV1WorkoutsEvents200["events"][number];

function projectWorkoutEvent(event: WorkoutEvent) {
	if (event.type === "updated" && "workout" in event) {
		return { type: "updated" as const, workout: projectWorkout(event.workout) };
	}
	if (event.type === "deleted" && "id" in event) {
		return {
			type: "deleted" as const,
			id: event.id,
			deleted_at: event.deleted_at,
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

const SAFE_WORKFLOW_NAMES = {
	"training-summary": "training-summary",
	"routine-discovery": "routine-discovery",
} as const satisfies Record<
	string,
	NonNullable<ToolResultTelemetry["workflow"]>["name"]
>;

function workflowResultTelemetry(
	workflow: WorkflowTelemetry,
): ToolResultTelemetry["workflow"] {
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
	normalize: (input: PaginatedInput<Workout>) => {
		const data = normalizePaginatedInput(input);
		return {
			workouts: data.items.map(summarizeWorkout),
			page: data.page,
			page_count: data.pageCount,
			has_next_page:
				data.pageCount === undefined ? undefined : data.page < data.pageCount,
		};
	},
	legacyJson: ({ workouts }) => workouts,
	text: (_data, { workouts }) =>
		workouts.length === 0
			? "No workouts found for the specified parameters"
			: undefined,
	telemetry: (workouts) => ({
		itemCountBucket: bucketCount(
			normalizePaginatedInput(workouts).items.length,
		),
		expected404Outcome: normalizePaginatedInput(workouts).expected404Outcome,
	}),
});

export const workoutResponse = defineStructuredResponseContract({
	outputSchema: workoutOutputSchema,
	normalize: (data: {
		workout: Workout | null | undefined;
		workout_id: string;
		expected404Outcome?: "not_found";
	}) => ({ workout: data.workout ? projectWorkout(data.workout) : null }),
	legacyJson: ({ workout }) => workout,
	text: ({ workout_id }, { workout }) =>
		workout === null ? `Workout with ID ${workout_id} not found` : undefined,
	telemetry: ({ workout, expected404Outcome }) => ({
		...workoutResultTelemetry(workout),
		expected404Outcome,
	}),
});

export const workoutCountResponse = defineStructuredResponseContract({
	outputSchema: workoutCountOutputSchema,
	normalize: (count: number) => ({ workout_count: count }),
	legacyJson: (output) => output,
	telemetry: (count) => ({ itemCountBucket: bucketCount(count) }),
});

export const workoutEventsResponse = defineStructuredResponseContract({
	outputSchema: workoutEventsOutputSchema,
	normalize: (data: {
		events: readonly WorkoutEvent[] | undefined;
		since: string;
		page: number;
		pageCount?: number;
		expected404Outcome?: "end_of_list";
	}) => ({
		events: data.events?.map(projectWorkoutEvent) ?? [],
		page: data.page,
		page_count: data.pageCount,
		has_next_page:
			data.pageCount === undefined ? undefined : data.page < data.pageCount,
	}),
	legacyJson: ({ events }) => events,
	text: ({ since }, { events }) =>
		events.length === 0
			? `No workout events found for the specified parameters since ${since}`
			: undefined,
	telemetry: (data) => ({
		itemCountBucket: bucketCount(data.events?.length ?? 0),
		expected404Outcome: data.expected404Outcome,
	}),
});

export const routinesResponse = defineStructuredResponseContract({
	outputSchema: routinesOutputSchema,
	normalize: (input: PaginatedInput<Routine>) => {
		const data = normalizePaginatedInput(input);
		return {
			routines: data.items.map(summarizeRoutine),
			page: data.page,
			page_count: data.pageCount,
			has_next_page:
				data.pageCount === undefined ? undefined : data.page < data.pageCount,
		};
	},
	legacyJson: ({ routines }) => routines,
	text: (_data, { routines }) =>
		routines.length === 0
			? "No routines found for the specified parameters"
			: undefined,
	telemetry: (routines) => ({
		itemCountBucket: bucketCount(
			normalizePaginatedInput(routines).items.length,
		),
		expected404Outcome: normalizePaginatedInput(routines).expected404Outcome,
	}),
});

export const routineResponse = defineStructuredResponseContract({
	outputSchema: routineOutputSchema,
	normalize: (data: {
		routine: Routine | null | undefined;
		routine_id: string;
		expected404Outcome?: "not_found";
	}) => ({ routine: data.routine ? projectRoutine(data.routine) : null }),
	legacyJson: ({ routine }) => routine,
	text: ({ routine_id }, { routine }) =>
		routine === null ? `Routine with ID ${routine_id} not found` : undefined,
	telemetry: ({ routine, expected404Outcome }) => ({
		...routineResultTelemetry(routine),
		expected404Outcome,
	}),
});

export const exerciseTemplatesResponse = defineStructuredResponseContract({
	outputSchema: exerciseTemplatesOutputSchema,
	normalize: (input: PaginatedInput<ExerciseTemplate>) => {
		const data = normalizePaginatedInput(input);
		return {
			exercise_templates: data.items,
			page: data.page,
			page_count: data.pageCount,
			has_next_page:
				data.pageCount === undefined ? undefined : data.page < data.pageCount,
		};
	},
	legacyJson: ({ exercise_templates }) => exercise_templates,
	text: (_data, { exercise_templates }) =>
		exercise_templates.length === 0
			? "No exercise templates found for the specified parameters"
			: undefined,
	telemetry: (templates) => ({
		itemCountBucket: bucketCount(
			normalizePaginatedInput(templates).items.length,
		),
		expected404Outcome: normalizePaginatedInput(templates).expected404Outcome,
	}),
});

export const exerciseTemplateResponse = defineStructuredResponseContract({
	outputSchema: exerciseTemplateOutputSchema,
	normalize: (data: {
		exercise_template: ExerciseTemplate | null | undefined;
		exercise_template_id: string;
		expected404Outcome?: "not_found";
	}) => ({
		exercise_template: data.exercise_template ?? null,
	}),
	legacyJson: ({ exercise_template }) => exercise_template,
	text: ({ exercise_template_id }, { exercise_template }) =>
		exercise_template === null
			? `Exercise template with ID ${exercise_template_id} not found`
			: undefined,
	telemetry: ({ exercise_template, expected404Outcome }) => ({
		itemCountBucket: bucketCount(exercise_template ? 1 : 0),
		expected404Outcome,
	}),
});

export const exerciseHistoryResponse = defineStructuredResponseContract({
	outputSchema: exerciseHistoryOutputSchema,
	normalize: (data: {
		exercise_history: readonly ExerciseHistoryEntry[] | undefined;
		exercise_template_id: string;
	}) => ({
		exercise_history:
			data.exercise_history?.map(normalizeExerciseHistoryEntry) ?? [],
	}),
	legacyJson: ({ exercise_history }) => exercise_history,
	text: ({ exercise_template_id }, { exercise_history }) =>
		exercise_history.length === 0
			? `No exercise history found for template ${exercise_template_id}`
			: undefined,
	telemetry: (data) => ({
		itemCountBucket: bucketCount(data.exercise_history?.length ?? 0),
	}),
});

export const searchExerciseTemplatesResponse = defineStructuredResponseContract(
	{
		outputSchema: exerciseTemplateSearchOutputSchema,
		normalize: (data: {
			results: readonly ExerciseTemplate[];
			query: string;
			primary_muscle_group?: string;
		}) => ({ exercise_templates: data.results }),
		legacyJson: ({ exercise_templates }) => exercise_templates,
		text: ({ query, primary_muscle_group }, { exercise_templates }) =>
			exercise_templates.length === 0
				? `No exercise templates found matching "${query}"${primary_muscle_group ? ` with primary muscle group "${primary_muscle_group}"` : ""}`
				: undefined,
		telemetry: (data) => ({
			itemCountBucket: bucketCount(data.results.length),
		}),
	},
);

export const routineFoldersResponse = defineStructuredResponseContract({
	outputSchema: routineFoldersOutputSchema,
	normalize: (input: PaginatedInput<RoutineFolder>) => {
		const data = normalizePaginatedInput(input);
		return {
			routine_folders: data.items.map(projectRoutineFolder),
			page: data.page,
			page_count: data.pageCount,
			has_next_page:
				data.pageCount === undefined ? undefined : data.page < data.pageCount,
		};
	},
	legacyJson: ({ routine_folders }) => routine_folders,
	text: (_data, { routine_folders }) =>
		routine_folders.length === 0
			? "No routine folders found for the specified parameters"
			: undefined,
	telemetry: (folders) => ({
		itemCountBucket: bucketCount(normalizePaginatedInput(folders).items.length),
		expected404Outcome: normalizePaginatedInput(folders).expected404Outcome,
	}),
});

export const routineFolderResponse = defineStructuredResponseContract({
	outputSchema: routineFolderOutputSchema,
	normalize: (data: {
		routine_folder: RoutineFolder | null | undefined;
		folder_id: string;
		expected404Outcome?: "not_found";
	}) => ({
		routine_folder: data.routine_folder
			? projectRoutineFolder(data.routine_folder)
			: null,
	}),
	legacyJson: ({ routine_folder }) => routine_folder,
	text: ({ folder_id }, { routine_folder }) =>
		routine_folder === null
			? `Routine folder with ID ${folder_id} not found`
			: undefined,
	telemetry: ({ routine_folder, expected404Outcome }) => ({
		itemCountBucket: bucketCount(routine_folder ? 1 : 0),
		expected404Outcome,
	}),
});

export const bodyMeasurementsResponse = defineStructuredResponseContract({
	outputSchema: bodyMeasurementsOutputSchema,
	normalize: (input: PaginatedInput<BodyMeasurement>) => {
		const data = normalizePaginatedInput(input);
		return {
			body_measurements: data.items.map(normalizeBodyMeasurement),
			page: data.page,
			page_count: data.pageCount,
			has_next_page:
				data.pageCount === undefined ? undefined : data.page < data.pageCount,
		};
	},
	legacyJson: ({ body_measurements }) => body_measurements,
	text: (_data, { body_measurements }) =>
		body_measurements.length === 0
			? "No body measurements found for the specified parameters"
			: undefined,
	telemetry: (measurements) => ({
		itemCountBucket: bucketCount(
			normalizePaginatedInput(measurements).items.length,
		),
		expected404Outcome:
			normalizePaginatedInput(measurements).expected404Outcome,
	}),
});

export const bodyMeasurementResponse = defineStructuredResponseContract({
	outputSchema: bodyMeasurementOutputSchema,
	normalize: (data: {
		body_measurement: BodyMeasurement | null | undefined;
		date: string;
		expected404Outcome?: "not_found";
	}) => ({
		body_measurement: data.body_measurement
			? normalizeBodyMeasurement(data.body_measurement)
			: null,
	}),
	legacyJson: ({ body_measurement }) => body_measurement,
	text: ({ date }, { body_measurement }) =>
		body_measurement === null
			? `No body measurement found for date ${date}`
			: undefined,
	telemetry: ({ body_measurement, expected404Outcome }) => ({
		itemCountBucket: bucketCount(body_measurement ? 1 : 0),
		expected404Outcome,
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
type TrainingSummaryOutput = z.output<
	z.ZodObject<typeof trainingSummaryOutputSchema>
>;
type CompactRoutinesOutput = z.output<
	z.ZodObject<typeof compactRoutinesOutputSchema>
>;
export type TrainingSummaryResult = Omit<TrainingSummaryOutput, "scan"> & {
	workflow: WorkflowTelemetry;
};
export type CompactRoutinesResult = Omit<CompactRoutinesOutput, "scan"> & {
	workflow: WorkflowTelemetry;
};

export const trainingSummaryResponse = defineStructuredResponseContract({
	outputSchema: trainingSummaryOutputSchema,
	normalize: (data: TrainingSummaryResult) => {
		const { workflow, ...result } = data;
		const { latest, earliest, weight_change_kg, ...body_measurements } =
			result.body_measurements;
		const normalizedBodyMeasurements: TrainingSummaryOutput["body_measurements"] = {
			...body_measurements,
		};
		if (latest) normalizedBodyMeasurements.latest = latest;
		if (earliest) normalizedBodyMeasurements.earliest = earliest;
		if (weight_change_kg != null) normalizedBodyMeasurements.weight_change_kg = weight_change_kg;
		return {
			...result,
			body_measurements: normalizedBodyMeasurements,
			scan: { pages: workflow.pagination, items: workflow.itemsScanned },
		};
	},
	legacyJson: (output) => output,
	text: (data) =>
		data.workouts.count === 0 && data.body_measurements.count === 0
			? "No workouts or body measurements found for the specified period"
			: undefined,
	telemetry: (data) => ({
		itemCountBucket: bucketCount(
			data.workouts.count + data.body_measurements.count,
		),
		workflow: workflowResultTelemetry(data.workflow),
	}),
});

export const compactRoutinesResponse = defineStructuredResponseContract({
	outputSchema: compactRoutinesOutputSchema,
	normalize: (data: CompactRoutinesResult) => {
		const { workflow, ...result } = data;
	const routines = result.routines.map((routine) => {
		const normalized = { ...routine };
		if (routine.folder_id == null) normalized.folder_id = undefined;
		return normalized;
	});
		return {
			...result,
			routines,
			scan: { pages: workflow.pagination, items: workflow.itemsScanned },
		};
	},
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
			? { json: projectWorkout(workout) }
			: { text: "Failed to create workout: Server returned no data" },
	(workout) => workoutResultTelemetry(workout),
);

export const updateWorkoutResponse = defineJsonResponseContract(
	(data: { workout: Workout | null | undefined; workout_id: string }) =>
		data.workout
			? { json: projectWorkout(data.workout) }
			: { text: `Failed to update workout with ID ${data.workout_id}` },
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
					json: projectRoutine(data.routine),
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
		routine_id: string;
		usesRepRanges: boolean;
	}) =>
		data.routine
			? {
					json: projectRoutine(data.routine),
					additionalText: data.usesRepRanges
						? [repRangeDisplayWarningText]
						: [],
				}
			: { text: `Failed to update routine with ID ${data.routine_id}` },
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
			? { json: projectRoutineFolder(folder) }
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
