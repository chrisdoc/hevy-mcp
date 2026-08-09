import {
	HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
	HEVY_REQUEST_ABORTED_ERROR_CODE,
	HEVY_RETRY_EXHAUSTED_ERROR_CODE,
} from "./hevy-http-error.js";

/** Canonical identities for every endpoint template in the generated Hevy client. */
export type HevyEndpointTemplate =
	| "/v1/body_measurements"
	| "/v1/body_measurements/:date"
	| "/v1/exercise_history/:exerciseTemplateId"
	| "/v1/exercise_templates"
	| "/v1/exercise_templates/:exerciseTemplateId"
	| "/v1/routine_folders"
	| "/v1/routine_folders/:folderId"
	| "/v1/routines"
	| "/v1/routines/:routineId"
	| "/v1/user/info"
	| "/v1/workouts"
	| "/v1/workouts/:workoutId"
	| "/v1/workouts/count"
	| "/v1/workouts/events";

export type HevyEndpointIdentity = HevyEndpointTemplate | "unknown";
export type HevyDiagnosticEndpoint = HevyEndpointTemplate;
export type HevyMetricEndpoint = HevyEndpointTemplate | "unknown";

export const HEVY_ENDPOINT_TEMPLATES: readonly HevyEndpointTemplate[] = [
	"/v1/body_measurements",
	"/v1/body_measurements/:date",
	"/v1/exercise_history/:exerciseTemplateId",
	"/v1/exercise_templates",
	"/v1/exercise_templates/:exerciseTemplateId",
	"/v1/routine_folders",
	"/v1/routine_folders/:folderId",
	"/v1/routines",
	"/v1/routines/:routineId",
	"/v1/user/info",
	"/v1/workouts",
	"/v1/workouts/:workoutId",
	"/v1/workouts/count",
	"/v1/workouts/events",
];

export interface HevyEndpointResolution {
	readonly known: boolean;
	readonly canonical: HevyEndpointIdentity;
	readonly diagnostic: HevyDiagnosticEndpoint | undefined;
	readonly metric: HevyMetricEndpoint;
}

const STATIC_ENDPOINTS = new Set<HevyEndpointTemplate>([
	"/v1/body_measurements",
	"/v1/exercise_templates",
	"/v1/routine_folders",
	"/v1/routines",
	"/v1/user/info",
	"/v1/workouts",
	"/v1/workouts/count",
	"/v1/workouts/events",
]);

const DYNAMIC_ENDPOINTS: readonly (readonly [string, HevyEndpointTemplate])[] =
	[
		["/v1/body_measurements/", "/v1/body_measurements/:date"],
		["/v1/exercise_history/", "/v1/exercise_history/:exerciseTemplateId"],
		["/v1/exercise_templates/", "/v1/exercise_templates/:exerciseTemplateId"],
		["/v1/routine_folders/", "/v1/routine_folders/:folderId"],
		["/v1/routines/", "/v1/routines/:routineId"],
		["/v1/workouts/", "/v1/workouts/:workoutId"],
	];

function identityPath(value: string): string {
	const query = value.search(/[?#]/);
	return query < 0 ? value : value.slice(0, query);
}

/** Resolve a raw request path or a canonical template without exposing IDs. */
export function resolveHevyEndpoint(path: string): HevyEndpointResolution {
	const candidate = identityPath(path);
	let endpoint: HevyEndpointTemplate | undefined;
	if (STATIC_ENDPOINTS.has(candidate as HevyEndpointTemplate)) {
		endpoint = candidate as HevyEndpointTemplate;
	} else {
		for (const [prefix, template] of DYNAMIC_ENDPOINTS) {
			const id = candidate.slice(prefix.length);
			if (candidate.startsWith(prefix) && id.length > 0 && !id.includes("/")) {
				endpoint = template;
				break;
			}
		}
	}
	if (
		!endpoint &&
		HEVY_ENDPOINT_TEMPLATES.includes(candidate as HevyEndpointTemplate)
	) {
		endpoint = candidate as HevyEndpointTemplate;
	}
	return endpoint
		? {
				known: true,
				canonical: endpoint,
				diagnostic: endpoint,
				metric: endpoint,
			}
		: {
				known: false,
				canonical: "unknown",
				diagnostic: undefined,
				metric: "unknown",
			};
}

export function canonicalEndpointIdentity(path: string): HevyEndpointIdentity {
	return resolveHevyEndpoint(path).canonical;
}

export function diagnosticEndpointIdentity(
	path: string,
): HevyDiagnosticEndpoint | undefined {
	return resolveHevyEndpoint(path).diagnostic;
}

export function metricEndpointIdentity(path: string): HevyMetricEndpoint {
	return resolveHevyEndpoint(path).metric;
}

export type ExpectedGet404Outcome = "not_found" | "end_of_list";

const RESOURCE_404_ENDPOINTS = new Set<HevyEndpointTemplate>([
	"/v1/body_measurements/:date",
	"/v1/exercise_history/:exerciseTemplateId",
	"/v1/exercise_templates/:exerciseTemplateId",
	"/v1/routine_folders/:folderId",
	"/v1/routines/:routineId",
	"/v1/workouts/:workoutId",
]);
const LIST_404_ENDPOINTS = new Set<HevyEndpointTemplate>([
	"/v1/body_measurements",
	"/v1/exercise_templates",
	"/v1/routine_folders",
	"/v1/routines",
	"/v1/workouts",
	"/v1/workouts/events",
]);

/** Return the bounded meaning of a GET 404, if it is an expected absence. */
export function expectedGet404Outcome(
	endpoint: string,
	method: string,
	status: number | undefined,
	page?: number,
): ExpectedGet404Outcome | undefined {
	if (status !== 404 || method.toUpperCase() !== "GET") return undefined;
	const resolved = resolveHevyEndpoint(endpoint).canonical;
	if (RESOURCE_404_ENDPOINTS.has(resolved as HevyEndpointTemplate)) {
		return "not_found";
	}
	if (
		page !== undefined &&
		page > 1 &&
		LIST_404_ENDPOINTS.has(resolved as HevyEndpointTemplate)
	) {
		return "end_of_list";
	}
	return undefined;
}

export type Mutation404Policy = "expected" | "unexpected";
const MUTATION_404_ENDPOINTS = new Set<HevyEndpointTemplate>([
	"/v1/body_measurements",
	"/v1/body_measurements/:date",
	"/v1/exercise_templates",
	"/v1/routine_folders",
	"/v1/routines",
	"/v1/routines/:routineId",
	"/v1/workouts",
	"/v1/workouts/:workoutId",
]);

/** Mutating 404s are expected only for known mutable endpoint identities. */
export function mutation404Policy(
	endpoint: string,
	method: string,
	status: number | undefined,
): Mutation404Policy {
	return status === 404 &&
		method.toUpperCase() !== "GET" &&
		MUTATION_404_ENDPOINTS.has(
			resolveHevyEndpoint(endpoint).canonical as HevyEndpointTemplate,
		)
		? "expected"
		: "unexpected";
}

export function isExpectedMutation404(
	endpoint: string,
	method: string,
	status: number | undefined,
): boolean {
	return mutation404Policy(endpoint, method, status) === "expected";
}

const NON_RETRYABLE_CODES = new Set([
	HEVY_REQUEST_ABORTED_ERROR_CODE,
	HEVY_RETRY_EXHAUSTED_ERROR_CODE,
	HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
]);

export function isTransientRetryStatus(status: number | undefined): boolean {
	return (
		status === undefined ||
		status === 408 ||
		status === 429 ||
		(status >= 500 && status <= 599)
	);
}

export function isTransientRetryCode(code: string | undefined): boolean {
	return code === undefined || !NON_RETRYABLE_CODES.has(code);
}

/** Shared status/code classification; execution layers still own retry budgets. */
export function isTransientRetryFailure(
	status: number | undefined,
	code?: string,
): boolean {
	return isTransientRetryCode(code) && isTransientRetryStatus(status);
}
