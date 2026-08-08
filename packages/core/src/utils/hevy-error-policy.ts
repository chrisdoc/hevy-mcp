import { extractErrorStatus } from "./error-policy.js";
import {
	expectedGet404Outcome,
	isExpectedMutation404 as isExpectedMutation404Policy,
	isHevyHttpError,
} from "@hevy-mcp/hevy-client";

export type HevyReadOperation = "get" | "list";
export type Expected404Outcome = "not_found" | "end_of_list";

/** True only for a sanitized Hevy GET of a known single resource. */
export function isExpectedReadNotFound(error: unknown): boolean {
	return (
		isHevyHttpError(error) &&
		expectedGet404Outcome(
			error.endpoint,
			error.method,
			extractErrorStatus(error),
		) === "not_found"
	);
}

/** True only for an undocumented empty page after the first page. */
export function isExpectedListPageNotFound(
	error: unknown,
	page: number,
): boolean {
	return (
		page > 1 &&
		isHevyHttpError(error) &&
		expectedGet404Outcome(
			error.endpoint,
			error.method,
			extractErrorStatus(error),
			page,
		) === "end_of_list"
	);
}

/** Mutation/caller 404s remain MCP errors but do not create Sentry issues. */
export function isExpectedMutationNotFound(error: unknown): boolean {
	return (
		isHevyHttpError(error) &&
		isExpectedMutation404Policy(
			error.endpoint,
			error.method,
			extractErrorStatus(error),
		)
	);
}
