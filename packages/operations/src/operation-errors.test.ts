import { HevyHttpError, NotFoundError } from "@hevy-mcp/hevy-client";
import { describe, expect, it } from "vitest";
import {
	classifyReadError,
	isExpectedReadEndOfList,
	isExpectedReadNotFound,
} from "./operation-errors.js";

function notFound(endpoint: string, method = "GET") {
	return new HevyHttpError("not found", {
		status: 404,
		method,
		endpoint,
	});
}

describe("classifyReadError", () => {
	it("classifies a known resource 404", () => {
		const error = notFound("/v1/routines/routine-1");

		expect(classifyReadError(error, "/v1/routines")).toBe("not_found");
		expect(isExpectedReadNotFound(error, "/v1/routines")).toBe(true);
	});

	it("classifies a later collection-page 404", () => {
		const error = notFound("/v1/workouts");

		expect(classifyReadError(error, "/v1/workouts", 2)).toBe("end_of_list");
		expect(isExpectedReadEndOfList(error, "/v1/workouts", 2)).toBe(true);
	});

	it("does not hide first-page, mutation, or unrelated 404s", () => {
		expect(
			classifyReadError(notFound("/v1/workouts"), "/v1/workouts", 1),
		).toBeUndefined();
		expect(
			classifyReadError(notFound("/v1/workouts", "POST"), "/v1/workouts", 2),
		).toBeUndefined();
		expect(
			classifyReadError(notFound("/v1/routines/routine-1"), "/v1/workouts", 2),
		).toBeUndefined();
		expect(
			classifyReadError(new Error("network failure"), "/v1/workouts", 2),
		).toBeUndefined();
	});

	it("classifies tagged collection 404s only for their matching endpoint", () => {
		const endpoints = [
			"/v1/body_measurements",
			"/v1/exercise_templates",
			"/v1/routine_folders",
			"/v1/routines",
			"/v1/workouts",
			"/v1/workouts/events",
		] as const;

		for (const endpoint of endpoints) {
			const error = new NotFoundError({
				status: 404,
				method: "GET",
				endpoint,
				expected: true,
			});

			expect(classifyReadError(error, endpoint, 2)).toBe("end_of_list");
			expect(classifyReadError(error, endpoint, 1)).toBeUndefined();
		}
	});

	it("does not classify a sibling endpoint through a collection prefix", () => {
		const error = new NotFoundError({
			status: 404,
			method: "GET",
			endpoint: "/v1/workouts/count",
			expected: true,
		});

		expect(classifyReadError(error, "/v1/workouts", 2)).toBeUndefined();
	});

	it("does not classify history, count, or user 404s as expected reads", () => {
		for (const endpoint of [
			"/v1/exercise_history/:exerciseTemplateId",
			"/v1/workouts/count",
			"/v1/user/info",
		] as const) {
			const error = new NotFoundError({
				status: 404,
				method: "GET",
				endpoint,
				expected: false,
			});

			expect(classifyReadError(error, endpoint)).toBeUndefined();
			expect(classifyReadError(error, endpoint, 2)).toBeUndefined();
		}
	});
});
