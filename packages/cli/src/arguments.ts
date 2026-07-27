import {
	getV1BodyMeasurementsDatePathParamsSchema,
	getV1BodyMeasurementsQueryParamsSchema,
	getV1ExerciseHistoryExercisetemplateidPathParamsSchema,
	getV1ExerciseTemplatesExercisetemplateidPathParamsSchema,
	getV1WorkoutsEventsQueryParamsSchema,
	getV1RoutinesQueryParamsSchema,
	getV1RoutinesRoutineidPathParamsSchema,
	getV1WorkoutsQueryParamsSchema,
	getV1WorkoutsWorkoutidPathParamsSchema,
} from "@hevy-mcp/hevy-client/schemas";
import { z } from "zod";

export interface CliArgs {
	command?: string;
	subcommand?: string;
	positionals: string[];
	options: Record<string, string | boolean>;
}

export class UsageError extends Error {}

export class ConfigurationError extends Error {}

function parseForUsage<T>(
	schema: z.ZodType<T>,
	value: unknown,
	labels: string | Record<string, string>,
	messages: Record<string, string> = {},
): T {
	try {
		return schema.parse(value);
	} catch (error) {
		if (!(error instanceof z.ZodError)) throw error;
		const issue = error.issues[0];
		const key = typeof issue?.path[0] === "string" ? issue.path[0] : undefined;
		const label =
			typeof labels === "string" ? labels : (key && labels[key]) || "Value";
		throw new UsageError(
			`${label} ${messages[key ?? "_"] ?? issue?.message ?? "is invalid"}`,
		);
	}
}

const safePositiveInteger = (message: string) =>
	z.number().int().refine(Number.isSafeInteger, message).min(1, message);

const paginationSchema = (
	source:
		| typeof getV1WorkoutsQueryParamsSchema
		| typeof getV1RoutinesQueryParamsSchema
		| typeof getV1BodyMeasurementsQueryParamsSchema,
) =>
	z.object({
		page: source.shape.page
			.pipe(safePositiveInteger("must be a positive integer"))
			.default(1),
		pageSize: source.shape.pageSize
			.pipe(
				z
					.number()
					.int()
					.refine(
						Number.isSafeInteger,
						"must be a positive integer no greater than 10",
					)
					.min(1, "must be a positive integer no greater than 10")
					.max(10, "must be a positive integer no greater than 10"),
			)
			.default(5),
	});

const eventOptionsSchema = z.object({
	page: getV1WorkoutsEventsQueryParamsSchema.shape.page
		.pipe(safePositiveInteger("must be a positive integer"))
		.default(1),
	pageSize: getV1WorkoutsEventsQueryParamsSchema.shape.pageSize
		.pipe(
			z
				.number()
				.int()
				.refine(
					Number.isSafeInteger,
					"must be a positive integer no greater than 10",
				)
				.min(1, "must be a positive integer no greater than 10")
				.max(10, "must be a positive integer no greater than 10"),
		)
		.default(5),
	since: getV1WorkoutsEventsQueryParamsSchema.shape.since.pipe(
		z.iso.datetime({
			offset: true,
			message: "must be an ISO timestamp",
		}),
	),
});

const historyDateSchema = z.iso.datetime({
	offset: true,
	message: "must be an ISO timestamp",
});
const exerciseHistoryOptionsSchema = z.object({
	start_date: z.string().pipe(historyDateSchema).optional(),
	end_date: z.string().pipe(historyDateSchema).optional(),
});

const safePathSegment = (message: string) =>
	z
		.string()
		.trim()
		.refine((value) => value.length > 0 && !/[/?#]/.test(value), message);
const workoutIdSchema =
	getV1WorkoutsWorkoutidPathParamsSchema.shape.workoutId.pipe(
		safePathSegment("is required and must be a safe path segment"),
	);
const routineIdSchema =
	getV1RoutinesRoutineidPathParamsSchema.shape.routineId.pipe(
		safePathSegment("is required and must be a safe path segment"),
	);
const exerciseIdSchema =
	getV1ExerciseTemplatesExercisetemplateidPathParamsSchema.shape.exerciseTemplateId.pipe(
		safePathSegment("is required and must be a safe path segment"),
	);
const exerciseHistoryIdSchema =
	getV1ExerciseHistoryExercisetemplateidPathParamsSchema.shape.exerciseTemplateId.pipe(
		safePathSegment("is required and must be a safe path segment"),
	);
const searchQuerySchema = safePathSegment(
	"is required and must be a safe search term",
);
const measurementDateSchema =
	getV1BodyMeasurementsDatePathParamsSchema.shape.date;
const weeksSchema = z.coerce
	.number()
	.max(520, "must be a positive integer no greater than 520")
	.pipe(safePositiveInteger("must be a positive integer no greater than 520"))
	.default(1);
const searchOptionsSchema = z.object({
	maxPages: z.coerce
		.number()
		.max(100, "must be a positive integer no greater than 100")
		.pipe(safePositiveInteger("must be a positive integer"))
		.default(10),
});

export function parsePagination(
	args: CliArgs,
	source:
		| typeof getV1WorkoutsQueryParamsSchema
		| typeof getV1RoutinesQueryParamsSchema
		| typeof getV1BodyMeasurementsQueryParamsSchema = getV1WorkoutsQueryParamsSchema,
): {
	page: number;
	pageSize: number;
} {
	return parseForUsage(
		paginationSchema(source),
		{ page: args.options.page, pageSize: args.options["page-size"] },
		{ page: "--page", pageSize: "--page-size" },
		{
			page: "must be a positive integer",
			pageSize: "must be a positive integer no greater than 10",
		},
	);
}

export function parseWorkoutEventsOptions(args: CliArgs): {
	page: number;
	pageSize: number;
	since: string;
} {
	return parseForUsage(
		eventOptionsSchema,
		{
			page: args.options.page,
			pageSize: args.options["page-size"],
			since: args.options.since,
		},
		{ page: "--page", pageSize: "--page-size", since: "--since" },
		{
			page: "must be a positive integer",
			pageSize: "must be a positive integer no greater than 10",
			since: "must be an ISO timestamp",
		},
	);
}

export function parseExerciseHistoryOptions(
	args: CliArgs = { positionals: [], options: {} },
): {
	start_date?: string;
	end_date?: string;
} {
	return parseForUsage(
		exerciseHistoryOptionsSchema,
		{
			start_date: args.options["start-date"],
			end_date: args.options["end-date"],
		},
		{ start_date: "--start-date", end_date: "--end-date" },
		{
			start_date: "must be an ISO timestamp",
			end_date: "must be an ISO timestamp",
		},
	);
}

export function parseWorkoutId(value: string | undefined): string {
	return parseForUsage(workoutIdSchema, value, "Workout ID", {
		_: "is required",
	});
}

export function parseRoutineId(value: string | undefined): string {
	return parseForUsage(routineIdSchema, value, "Routine ID", {
		_: "is required",
	});
}

export function parseExerciseId(value: string | undefined): string {
	return parseForUsage(exerciseIdSchema, value, "Exercise ID", {
		_: "is required",
	});
}

export function parseExerciseHistoryId(value: string | undefined): string {
	return parseForUsage(exerciseHistoryIdSchema, value, "Exercise ID", {
		_: "is required",
	});
}

export function parseMeasurementDate(value: string | undefined): string {
	return parseForUsage(measurementDateSchema, value, "Measurement date", {
		_: "must be an ISO date",
	});
}

export function parseSearchQuery(value: string | undefined): string {
	return parseForUsage(searchQuerySchema, value, "Search query", {
		_: "is required",
	}).toLocaleLowerCase();
}

export function parseSearchMaxPages(args: CliArgs): number {
	return parseForUsage(
		searchOptionsSchema,
		{ maxPages: args.options["max-pages"] },
		{ maxPages: "--max-pages" },
		{ maxPages: "must be a positive integer no greater than 100" },
	).maxPages;
}

export function parseWeeks(args: CliArgs): number {
	return parseForUsage(weeksSchema, args.options.weeks, "--weeks", {
		_: "must be a positive integer no greater than 520",
	});
}

export function requireMutationConfirmation(args: CliArgs): void {
	if (args.options.yes !== true)
		throw new UsageError("Mutation requires --yes");
}
