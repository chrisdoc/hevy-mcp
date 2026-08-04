import { describe, expect, it } from "vitest";
import { HevyHttpError } from "@hevy-mcp/hevy-client";
import {
	executionOutcome,
	executionResponse,
	executionStatus,
} from "./execution-response.js";

describe("execution response helpers", () => {
	it("computes status and projection once for a deadline outcome", async () => {
		const error = new HevyHttpError("deadline", {
			method: "GET",
			endpoint: "/v1/user/info",
			outcome: "deadline_exceeded",
		});
		const outcome = executionOutcome(error, 502);

		expect(outcome).toMatchObject({
			status: 504,
			execution: {
				outcome: "deadline_exceeded",
				safe_to_retry: false,
			},
		});
		expect(executionStatus(error, 502)).toBe(504);

		const response = executionResponse(error, "Request timed out", outcome);
		expect(response.status).toBe(504);
		expect(await response.json()).toMatchObject({
			error: {
				message: "Request timed out",
				outcome: "deadline_exceeded",
			},
		});
	});

	it("maps a cancelled HevyHttpError to HTTP 499", async () => {
		const error = new HevyHttpError("cancelled", {
			method: "POST",
			endpoint: "/v1/workouts",
			outcome: "cancelled",
		});

		const outcome = executionOutcome(error, 502);

		expect(outcome.status).toBe(499);
		expect(outcome.execution).toMatchObject({ outcome: "cancelled" });

		const response = executionResponse(error, "Request cancelled", outcome);
		expect(response.status).toBe(499);
		expect(await response.json()).toMatchObject({
			error: {
				message: "Request cancelled",
				outcome: "cancelled",
			},
		});
	});

	it("preserves the supplied fallback status for an ordinary error", async () => {
		const error = new Error("ordinary failure");
		const outcome = executionOutcome(error, 502);

		expect(outcome.status).toBe(502);
		expect(executionStatus(error, 502)).toBe(502);

		const response = executionResponse(error, "Request failed", outcome);
		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			error: { message: "Request failed" },
		});
	});
});
