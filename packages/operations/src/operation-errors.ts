import {
	canonicalEndpointIdentity,
	expectedGet404Outcome,
	isHevyHttpError,
	NotFoundError,
} from "@hevy-mcp/hevy-client";
import { Schema } from "effect";

export type ExpectedReadError = "not_found" | "end_of_list";
export type ReadCollectionEndpoint = "/v1/routines" | "/v1/workouts";
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

/**
 * Classify only the documented read-side 404 cases.
 *
 * This function is deliberately pure. It does not inspect mutable client
 * state, perform I/O, or convert the error, so Effect programs can use it as
 * their error-channel boundary while Promise callers retain the original
 * error object.
 */
export function classifyReadError(
	error: ReadOperationError,
	endpoint: ReadCollectionEndpoint,
	page?: number,
): ExpectedReadError | undefined {
	const httpError = isHevyHttpError(error)
		? error
		: error instanceof NotFoundError
			? error
			: undefined;
	if (!httpError) return undefined;
	const canonical = canonicalEndpointIdentity(httpError.endpoint);
	if (canonical !== endpoint && !canonical.startsWith(`${endpoint}/`)) {
		return undefined;
	}

	const expected = expectedGet404Outcome(
		httpError.endpoint,
		httpError.method,
		httpError.status,
		page,
	);
	if (expected === "not_found") return "not_found";
	if (expected === "end_of_list") return "end_of_list";
	return undefined;
}

export function isExpectedReadNotFound(
	error: ReadOperationError,
	endpoint: ReadCollectionEndpoint,
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
