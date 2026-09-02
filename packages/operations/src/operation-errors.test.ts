import { HevyHttpError } from "@hevy-mcp/hevy-client";
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
});
