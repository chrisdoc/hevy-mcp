import { extractErrorStatus } from "./error-policy.js";
import { isHevyHttpError } from "@hevy-mcp/hevy-client";

export type HevyReadOperation = "get" | "list";
export type Expected404Outcome = "not_found" | "end_of_list";

const READ_RESOURCE_ENDPOINTS = new Set([
	"/v1/body_measurements/:date",
	"/v1/exercise_templates/:exerciseTemplateId",
	"/v1/routine_folders/:folderId",
	"/v1/routines/:routineId",
	"/v1/workouts/:workoutId",
]);

const LIST_ENDPOINTS = new Set([
	"/v1/body_measurements",
	"/v1/exercise_templates",
	"/v1/routine_folders",
	"/v1/routines",
	"/v1/workouts",
	"/v1/workouts/events",
]);

const MUTATION_ENDPOINTS = new Set([
	"/v1/body_measurements",
	"/v1/body_measurements/:date",
	"/v1/exercise_templates",
	"/v1/routine_folders",
	"/v1/routines",
	"/v1/routines/:routineId",
	"/v1/workouts",
	"/v1/workouts/:workoutId",
]);

/** True only for a sanitized Hevy GET of a known single resource. */
export function isExpectedReadNotFound(error: unknown): boolean {
	return (
		isHevyHttpError(error) &&
		extractErrorStatus(error) === 404 &&
		error.method.toUpperCase() === "GET" &&
		READ_RESOURCE_ENDPOINTS.has(error.endpoint)
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
		extractErrorStatus(error) === 404 &&
		error.method.toUpperCase() === "GET" &&
		LIST_ENDPOINTS.has(error.endpoint)
	);
}

/** Mutation/caller 404s remain MCP errors but do not create Sentry issues. */
export function isExpectedMutationNotFound(error: unknown): boolean {
	return (
		isHevyHttpError(error) &&
		extractErrorStatus(error) === 404 &&
		error.method.toUpperCase() !== "GET" &&
		MUTATION_ENDPOINTS.has(error.endpoint)
	);
}
