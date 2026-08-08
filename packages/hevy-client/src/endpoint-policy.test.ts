import { describe, expect, it } from "vitest";
import {
	HEVY_ENDPOINT_TEMPLATES,
	canonicalEndpointIdentity,
	diagnosticEndpointIdentity,
	expectedGet404Outcome,
	isExpectedMutation404,
	isTransientRetryFailure,
	isTransientRetryStatus,
	metricEndpointIdentity,
	resolveHevyEndpoint,
} from "./endpoint-policy.js";

describe("Hevy endpoint policy", () => {
	it("resolves every generated endpoint template", () => {
		expect(HEVY_ENDPOINT_TEMPLATES).toHaveLength(14);
		for (const endpoint of HEVY_ENDPOINT_TEMPLATES) {
			expect(resolveHevyEndpoint(endpoint)).toMatchObject({
				known: true,
				canonical: endpoint,
				diagnostic: endpoint,
				metric: endpoint,
			});
		}
	});

	it("resolves each dynamic route with exactly one non-empty segment", () => {
		const routes = [
			["/v1/body_measurements/2026-01-01", "/v1/body_measurements/:date"],
			[
				"/v1/exercise_history/template-id",
				"/v1/exercise_history/:exerciseTemplateId",
			],
			[
				"/v1/exercise_templates/template-id",
				"/v1/exercise_templates/:exerciseTemplateId",
			],
			["/v1/routine_folders/folder-id", "/v1/routine_folders/:folderId"],
			["/v1/routines/routine-id", "/v1/routines/:routineId"],
			["/v1/workouts/workout-id", "/v1/workouts/:workoutId"],
		] as const;
		for (const [path, endpoint] of routes) {
			expect(canonicalEndpointIdentity(path)).toBe(endpoint);
		}
	});

	it("takes static precedence and strips query and fragment identity suffixes", () => {
		expect(canonicalEndpointIdentity("/v1/workouts/count?secret=id")).toBe(
			"/v1/workouts/count",
		);
		expect(canonicalEndpointIdentity("/v1/workouts/events#fragment")).toBe(
			"/v1/workouts/events",
		);
		expect(canonicalEndpointIdentity("/v1/workouts/abc?x=1#fragment")).toBe(
			"/v1/workouts/:workoutId",
		);
	});

	it("fails closed for private, prefix, extra-segment, and trailing-slash paths", () => {
		for (const endpoint of [
			"",
			"/v1/private/secret",
			"/v1/workouts/count/near-match",
			"/v1/workouts/abc/extra",
			"/v1/workouts/",
			"/v1/body_measurements/",
			"/v1/exercise_history/",
			"/v1/exercise_templates/",
			"/v1/routine_folders/",
			"/v1/routines/",
		]) {
			expect(canonicalEndpointIdentity(endpoint)).toBe("unknown");
			expect(diagnosticEndpointIdentity(endpoint)).toBeUndefined();
			expect(metricEndpointIdentity(endpoint)).toBe("unknown");
		}
		expect(canonicalEndpointIdentity("/v1/workouts")).toBe("/v1/workouts");
	});

	it("keeps the distinct GET 404 absence facts", () => {
		expect(
			expectedGet404Outcome("/v1/exercise_history/template-id", "GET", 404),
		).toBe("not_found");
		expect(
			expectedGet404Outcome("/v1/workouts", "GET", 404, 1),
		).toBeUndefined();
		expect(expectedGet404Outcome("/v1/workouts", "GET", 404, 2)).toBe(
			"end_of_list",
		);
		expect(
			expectedGet404Outcome("/v1/workouts", "POST", 404, 2),
		).toBeUndefined();
	});

	it("applies mutation 404 policy only to known mutable endpoints", () => {
		expect(isExpectedMutation404("/v1/routines/routine-id", "PUT", 404)).toBe(
			true,
		);
		expect(
			isExpectedMutation404("/v1/exercise_history/template-id", "POST", 404),
		).toBe(false);
		expect(isExpectedMutation404("/v1/private/secret", "POST", 404)).toBe(
			false,
		);
		expect(isExpectedMutation404("/v1/routines/routine-id", "GET", 404)).toBe(
			false,
		);
	});

	it("classifies retry boundaries without owning retry execution", () => {
		for (const status of [undefined, 408, 429, 500, 599]) {
			expect(isTransientRetryStatus(status)).toBe(true);
		}
		for (const status of [400, 404, 499, 600]) {
			expect(isTransientRetryStatus(status)).toBe(false);
		}
		expect(isTransientRetryFailure(503, "HEVY_RETRY_EXHAUSTED")).toBe(false);
		expect(isTransientRetryFailure(503, "HEVY_REQUEST_ABORTED")).toBe(false);
		expect(isTransientRetryFailure(503)).toBe(true);
	});
});
