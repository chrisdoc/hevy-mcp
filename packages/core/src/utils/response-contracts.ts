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
import {
	attachResultTelemetry,
	bucketCount,
	type ToolResultTelemetry,
} from "./result-telemetry.js";
import {
	createRoutineOutputSchema,
	optionalNumber,
	formattedBodyMeasurementSchema,
	formattedDeletedWorkoutSchema,
	formattedExerciseHistoryEntrySchema,
	formattedExerciseTemplateSchema,
	formattedRoutineFolderSchema,
	formattedRoutineSchema,
	formattedUpdatedWorkoutSchema,
	formattedWorkoutSchema,
	formattedWorkoutSummarySchema,
	compactRoutineSchema,
	scanSchema,
	trainingSummarySessionSchema,
} from "./output-schemas.js";
import {
	normalizeBodyMeasurement,
	normalizeExerciseHistoryEntry,
	projectRoutine,
	projectRoutineFolder,
	projectWorkout,
	summarizeRoutine,
	summarizeWorkout,
} from "./formatters.js";

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

export interface WorkflowTelemetry {
	name: "training-summary" | "routine-discovery";
	pagination: Readonly<Record<string, number>>;
	cacheStatus: "hit" | "miss" | "not-used";
	itemsScanned: number;
}

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
		const normalizedBodyMeasurements: TrainingSummaryOutput["body_measurements"] =
			{
				...body_measurements,
			};
		if (latest) normalizedBodyMeasurements.latest = latest;
		if (earliest) normalizedBodyMeasurements.earliest = earliest;
		if (weight_change_kg != null)
			normalizedBodyMeasurements.weight_change_kg = weight_change_kg;
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

export const createRoutineResponse = defineStructuredResponseContract({
	outputSchema: createRoutineOutputSchema,
	normalize: (data: {
		routine: Routine | null | undefined;
		usesRepRanges: boolean;
	}) => ({
		created: true as const,
		commit_state: "confirmed" as const,
		routine: data.routine ? projectRoutine(data.routine) : null,
		routine_id: data.routine?.id ?? null,
		uses_rep_ranges: data.usesRepRanges,
	}),
	legacyJson: (output) => output,
	additionalText: (_data, output) =>
		output.uses_rep_ranges ? [repRangeDisplayWarningText] : [],
	telemetry: (data) => routineResultTelemetry(data.routine),
});

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
