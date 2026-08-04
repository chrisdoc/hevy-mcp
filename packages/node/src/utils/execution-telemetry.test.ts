import { describe, expect, it } from "vitest";
import { projectExecutionAttributes } from "./execution-telemetry.js";

describe("projectExecutionAttributes", () => {
	it("projects snake_case execution fields for spans", () => {
		expect(
			projectExecutionAttributes({
				outcome: "terminal_failure",
				phase: "response-content",
				operation_safety: "read",
				commit_state: "unknown",
				safe_to_retry: false,
			}),
		).toEqual({
			"hevy.api.outcome": "terminal_failure",
			"hevy.api.phase": "response-content",
			"hevy.api.operation_safety": "read",
			"hevy.api.commit_state": "unknown",
			"hevy.api.safe_to_retry": false,
		});
	});

	it("projects camelCase observation fields for metrics", () => {
		expect(
			projectExecutionAttributes(
				{
					outcome: "retryable_failure",
					phase: "dispatch",
					operationSafety: "idempotent-write",
					commitState: "unknown",
					safeToRetry: false,
				},
				"metric",
			),
		).toEqual({
			outcome: "retryable_failure",
			phase: "dispatch",
			operation_safety: "idempotent-write",
			commit_state: "unknown",
			safe_to_retry: false,
		});
	});

	it("prefers snake_case fields when both representations are present", () => {
		expect(
			projectExecutionAttributes({
				operation_safety: "read",
				operationSafety: "non-idempotent-write",
				commit_state: "not_sent",
				commitState: "confirmed",
				safe_to_retry: false,
				safeToRetry: true,
			}),
		).toEqual({
			"hevy.api.operation_safety": "read",
			"hevy.api.commit_state": "not_sent",
			"hevy.api.safe_to_retry": false,
		});
	});
});
