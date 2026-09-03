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
export type ReadOperationError = Error;

export class PaginationMismatchError extends Schema.TaggedError<PaginationMismatchError>()(
	"PaginationMismatchError",
	{
		requested: Schema.Number,
		received: Schema.Number,
		collection: Schema.String,
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

function errorIdentity(error: ReadOperationError):
	| {
			readonly status?: number;
			readonly method: string;
			readonly endpoint: string;
	  }
	| undefined {
	if (isHevyHttpError(error) || error instanceof NotFoundError) {
		return {
			status: error.status,
			method: error.method,
			endpoint: error.endpoint,
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
	error: ReadOperationError,
	endpoint: ReadEndpoint,
	page?: number,
): ExpectedReadError | undefined {
	const identity = errorIdentity(error);
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
	error: ReadOperationError,
	endpoint: ReadEndpoint,
): boolean {
	return classifyReadError(error, endpoint) === "not_found";
}

export function isExpectedReadEndOfList(
	error: ReadOperationError,
	endpoint: ReadCollectionEndpoint,
	page: number,
): boolean {
	return page > 1 && classifyReadError(error, endpoint, page) === "end_of_list";
}
