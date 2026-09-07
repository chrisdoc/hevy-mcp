import {
	canonicalEndpointIdentity,
	type HevyEndpointTemplate,
	isHevyHttpError,
	NotFoundError,
} from "@hevy-mcp/hevy-client";
import { Effect, Predicate, Schema } from "effect";

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

/**
 * Detect the Hevy API's empty-object responses, which signal "no entity"
 * where a 404 would be expected. Shared so the shape check cannot drift
 * between operation modules.
 */
export function isEmptyResponse<T extends object>(
	response: T | null | undefined,
): response is T & Record<never, never> {
	return (
		response !== null &&
		response !== undefined &&
		Object.keys(response).length === 0
	);
}

/**
 * Recover a documented read-side 404 as a successful absence value.
 * Pipeable so get-style operations keep one outcome-mapping shape.
 */
export function withExpectedNotFound<A, E, Absent>(
	endpoint: ReadEndpoint,
	absent: Absent,
): (effect: Effect.Effect<A, E>) => Effect.Effect<A | Absent, E> {
	return (effect) =>
		effect.pipe(
			Effect.catchIf(
				(cause) => isExpectedReadNotFound(cause, endpoint),
				() => Effect.succeed(absent),
			),
		);
}

/**
 * Recover a documented later-page 404 as a successful end-of-list value.
 * Pipeable so list-style operations keep one outcome-mapping shape.
 */
export function withExpectedEndOfList<A, E, Absent>(
	endpoint: ReadCollectionEndpoint,
	page: number,
	absent: Absent,
): (effect: Effect.Effect<A, E>) => Effect.Effect<A | Absent, E> {
	return (effect) =>
		effect.pipe(
			Effect.catchIf(
				(cause) => isExpectedReadEndOfList(cause, endpoint, page),
				() => Effect.succeed(absent),
			),
		);
}

/**
 * Fail when the API echoes a different page than requested. Compose with
 * `Effect.tap` ahead of response projection so list operations share one
 * page-echo policy.
 */
export function assertPageEcho(
	response: { readonly page?: number | undefined } | null | undefined,
	requestedPage: number,
	collection: string,
): Effect.Effect<void, PaginationMismatchError> {
	if (response?.page !== undefined && response.page !== requestedPage) {
		return Effect.fail(
			new PaginationMismatchError({
				requested: requestedPage,
				received: response.page,
				collection,
				message: `Page mismatch for ${collection}: requested page ${requestedPage} but received page ${response.page}`,
			}),
		);
	}
	return Effect.void;
}

/**
 * Decide whether pagination continues: the page was non-empty and the API
 * reports more pages. Shared so every collection applies the same policy.
 */
export function hasNextPage(
	pageCount: number | undefined,
	page: number,
	itemCount: number,
): boolean {
	return (
		itemCount > 0 &&
		Predicate.isNumber(pageCount) &&
		Number.isSafeInteger(pageCount) &&
		pageCount > page
	);
}
