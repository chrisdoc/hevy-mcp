import {
	canonicalEndpointIdentity,
	type HevyEndpointTemplate,
	isHevyHttpError,
	NotFoundError,
} from "@hevy-mcp/hevy-client";
import { Schema } from "effect";

export type ExpectedReadError = "not_found" | "end_of_list";
export type ReadCollectionEndpoint = Extract<
	HevyEndpointTemplate,
	| "/v1/body_measurements"
	| "/v1/exercise_templates"
	| "/v1/routine_folders"
	| "/v1/routines"
	| "/v1/workouts"
	| "/v1/workouts/events"
>;
export type ReadMemberEndpoint = Extract<
	HevyEndpointTemplate,
	| "/v1/body_measurements/:date"
	| "/v1/exercise_templates/:exerciseTemplateId"
	| "/v1/routine_folders/:folderId"
	| "/v1/routines/:routineId"
	| "/v1/workouts/:workoutId"
>;
export type ReadEndpoint = HevyEndpointTemplate;

export class PaginationMismatchError extends Schema.TaggedError<PaginationMismatchError>()(
	"PaginationMismatchError",
	{
		requested: Schema.Number,
		received: Schema.Number,
		collection: Schema.String,
		message: Schema.String,
	},
) {}

export class WorkoutPrivacyError extends Schema.TaggedError<WorkoutPrivacyError>()(
	"WorkoutPrivacyError",
	{
		message: Schema.String,
	},
) {}

export class WorkoutPayloadError extends Schema.TaggedError<WorkoutPayloadError>()(
	"WorkoutPayloadError",
	{
		message: Schema.String,
	},
) {}

export class EmptyMeasurementUpdateError extends Schema.TaggedError<EmptyMeasurementUpdateError>()(
	"EmptyMeasurementUpdateError",
	{
		message: Schema.String,
	},
) {}

export class TrainingSummaryValidationError extends Schema.TaggedError<TrainingSummaryValidationError>()(
	"TrainingSummaryValidationError",
	{
		weeks: Schema.Number,
		message: Schema.String,
	},
) {}

export class TrainingSummaryDataError extends Schema.TaggedError<TrainingSummaryDataError>()(
	"TrainingSummaryDataError",
	{
		collection: Schema.String,
		message: Schema.String,
	},
) {}

export class TemplatesSearchValidationError extends Schema.TaggedError<TemplatesSearchValidationError>()(
	"TemplatesSearchValidationError",
	{
		maxPages: Schema.Number,
		message: Schema.String,
	},
) {}

const collectionMemberEndpoints = {
	"/v1/body_measurements": "/v1/body_measurements/:date",
	"/v1/exercise_templates": "/v1/exercise_templates/:exerciseTemplateId",
	"/v1/routine_folders": "/v1/routine_folders/:folderId",
	"/v1/routines": "/v1/routines/:routineId",
	"/v1/workouts": "/v1/workouts/:workoutId",
	"/v1/workouts/events": undefined,
} as const satisfies Record<
	ReadCollectionEndpoint,
	ReadMemberEndpoint | undefined
>;

function errorIdentity(cause: unknown):
	| {
			readonly status?: number;
			readonly method: string;
			readonly endpoint: string;
	  }
	| undefined {
	if (isHevyHttpError(cause) || cause instanceof NotFoundError) {
		return {
			status: cause.status,
			method: cause.method,
			endpoint: cause.endpoint,
		};
	}
	return undefined;
}

/**
 * Classify only the documented read-side 404 cases.
 *
 * Matching is based on the tagged error's HTTP identity and the operation's
 * endpoint identity. It deliberately does not inspect messages or mutable
 * request state, so unexpected errors remain in the Effect channel.
 */
export function classifyReadError(
	cause: unknown,
	endpoint: ReadEndpoint,
	page?: number,
): ExpectedReadError | undefined {
	const identity = errorIdentity(cause);
	if (
		identity === undefined ||
		identity.status !== 404 ||
		identity.method.toUpperCase() !== "GET"
	) {
		return undefined;
	}

	const canonicalError = canonicalEndpointIdentity(identity.endpoint);
	const canonicalOperation = canonicalEndpointIdentity(endpoint);
	if (page !== undefined) {
		if (
			page > 1 &&
			canonicalOperation in collectionMemberEndpoints &&
			canonicalError === canonicalOperation
		) {
			return "end_of_list";
		}
		return undefined;
	}

	if (
		canonicalOperation in collectionMemberEndpoints &&
		canonicalError ===
			collectionMemberEndpoints[canonicalOperation as ReadCollectionEndpoint]
	) {
		return "not_found";
	}
	if (canonicalOperation === canonicalError) {
		const memberEndpoint = canonicalOperation as ReadMemberEndpoint;
		if (
			memberEndpoint === "/v1/body_measurements/:date" ||
			memberEndpoint === "/v1/exercise_templates/:exerciseTemplateId" ||
			memberEndpoint === "/v1/routine_folders/:folderId" ||
			memberEndpoint === "/v1/routines/:routineId" ||
			memberEndpoint === "/v1/workouts/:workoutId"
		) {
			return "not_found";
		}
	}
	return undefined;
}

export function isExpectedReadNotFound(
	cause: unknown,
	endpoint: ReadEndpoint,
): boolean {
	return classifyReadError(cause, endpoint) === "not_found";
}

export function isExpectedReadEndOfList(
	cause: unknown,
	endpoint: ReadCollectionEndpoint,
	page: number,
): boolean {
	return page > 1 && classifyReadError(cause, endpoint, page) === "end_of_list";
}
