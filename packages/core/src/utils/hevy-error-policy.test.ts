import { describe, expect, it } from "vitest";
import { HevyHttpError } from "@hevy-mcp/hevy-client";
import {
	isExpectedListPageNotFound,
	isExpectedMutationNotFound,
	isExpectedReadNotFound,
} from "./hevy-error-policy.js";

function error(status: number, method: string, endpoint: string) {
	return new HevyHttpError("safe test error", { status, method, endpoint });
}

describe("Hevy 404 policy", () => {
	it("normalizes known single-resource GET 404s only", () => {
		expect(
			isExpectedReadNotFound(error(404, "GET", "/v1/workouts/:workoutId")),
		).toBe(true);
		expect(isExpectedReadNotFound(error(404, "GET", "/v1/routines"))).toBe(
			false,
		);
		expect(
			isExpectedReadNotFound(error(500, "GET", "/v1/workouts/:workoutId")),
		).toBe(false);
	});

	it("treats only later known list pages as end-of-list", () => {
		const list404 = error(404, "GET", "/v1/workouts");
		expect(isExpectedListPageNotFound(list404, 1)).toBe(false);
		expect(isExpectedListPageNotFound(list404, 2)).toBe(true);
		expect(
			isExpectedListPageNotFound(error(404, "GET", "/v1/user/info"), 2),
		).toBe(false);
	});

	it("recognizes mutation 404s without broad status mapping", () => {
		expect(
			isExpectedMutationNotFound(error(404, "PUT", "/v1/routines/:routineId")),
		).toBe(true);
		expect(
			isExpectedMutationNotFound(error(404, "GET", "/v1/routines/:routineId")),
		).toBe(false);
		expect(isExpectedMutationNotFound({ status: 404 })).toBe(false);
		expect(isExpectedMutationNotFound(error(404, "POST", "/v1/unknown"))).toBe(
			false,
		);
	});
});
