import {
	ErrorType,
	type SafeToolCompletion,
	type SafeToolInvocation,
} from "@hevy-mcp/core";
import { describe, expect, it, vi } from "vitest";
import {
	createWorkerToolObserver,
	type WorkerObservationEvent,
} from "./worker-observer.js";

const invocation = {
	name: "get-workouts",
	kind: "tool",
	taxonomy: { feature: "workouts", kind: "read", operation: "list" },
	argumentKeys: ["page", "query", "workout_id", "raw-secret"],
	argumentPresence: { query: true, workout_id: true, "raw-secret": true },
	numericArgumentBuckets: { page: "2-10", limit: "not-a-bucket" },
	booleanArguments: { refresh: true },
	argumentKeyCountBucket: "2-10",
} as unknown as SafeToolInvocation;

function createScope(events: WorkerObservationEvent[]) {
	const scope = createWorkerToolObserver({
		sink: (event) => {
			events.push(event);
		},
	}).start(invocation);
	if (!scope) throw new Error("Expected a Worker observation scope");
	return scope;
}

describe("createWorkerToolObserver", () => {
	it("emits safe bounded invocation and successful completion events", async () => {
		const events: WorkerObservationEvent[] = [];
		const scope = createScope(events);

		await expect(
			scope.run(() => Promise.resolve("raw response body")),
		).resolves.toBe("raw response body");
		void scope.finish({
			outcome: "success",
			durationMs: 12,
			result: {
				isError: false,
				hasStructuredContent: true,
				contentCountBucket: "2-10",
				summary: {
					itemCountBucket: "11-50",
					workflow: {
						name: "training-summary",
						cacheStatus: "miss",
						itemsScanned: 12,
						pagination: { workouts: 2, routines: 1, secret: 999 },
					},
				},
			},
		});

		expect(events).toHaveLength(2);
		expect(events[0]).toMatchObject({
			event: "worker.tool.invocation",
			name: "get-workouts",
			kind: "tool",
			taxonomy: invocation.taxonomy,
			argumentKeys: ["page", "query", "workout_id"],
			argumentPresence: { query: true, workout_id: true },
			numericArgumentBuckets: { page: "2-10" },
			booleanArguments: { refresh: true },
		});
		expect(events[1]).toMatchObject({
			event: "worker.tool.completion",
			outcome: "success",
			durationMs: 12,
			result: {
				contentCountBucket: "2-10",
				summary: {
					itemCountBucket: "11-50",
					workflow: {
						name: "training-summary",
						cacheStatus: "miss",
						itemsScanned: 12,
						pagination: { workouts: 2, routines: 1 },
					},
				},
			},
		});
		expect(JSON.stringify(events)).not.toContain("raw-secret");
		expect(JSON.stringify(events)).not.toContain("raw response body");
		expect(JSON.stringify(events)).not.toContain("secret");
	});

	it.each([
		[
			"returned_error",
			{ isError: true, hasStructuredContent: false, contentCountBucket: "1" },
		],
		["thrown_error", undefined],
	] as const)("records %s outcomes", (outcome, result) => {
		const events: WorkerObservationEvent[] = [];
		const scope = createScope(events);
		const completion: SafeToolCompletion = {
			outcome,
			durationMs: 4,
			...(result
				? { result }
				: {
						errorType: ErrorType.NETWORK_ERROR,
						error: {
							category: "HevyHttpError",
							code: "ETIMEDOUT",
							status: 503,
							method: "GET",
							endpoint: "/v1/workouts/:workoutId",
						},
					}),
		};
		void scope.finish(completion);

		const event = events[1];
		expect(event).toMatchObject({ event: "worker.tool.completion", outcome });
		if (outcome === "thrown_error") {
			expect(event).toMatchObject({
				errorType: "NETWORK_ERROR",
				error: { category: "HevyHttpError", code: "ETIMEDOUT", status: 503 },
				execution: {
					outcome: "terminal_failure",
					phase: "before-dispatch",
					commit_state: "not_sent",
					safe_to_retry: false,
				},
			});
		} else {
			expect(event?.result?.isError).toBe(true);
		}
	});

	it("drops malformed diagnostic fields at the Worker boundary", () => {
		const events: WorkerObservationEvent[] = [];
		const scope = createScope(events);
		void scope.finish({
			outcome: "thrown_error",
			durationMs: 1,
			error: {
				category: "secret-category",
				code: "secret-code",
				status: 999,
				method: "GET?token=secret",
				endpoint: "/v1/workouts/user-secret",
				phase: "secret-phase",
				operation_safety: "secret-safety",
				commit_state: "secret-state",
				safe_to_retry: true,
				outcome: "secret-outcome",
				frames: [
					{ source: "secret-source", line: 1, column: 1 },
					{ source: "worker", line: 1, column: 1 },
				],
			},
			errorOutcome: {
				outcome: "secret-outcome",
				phase: "secret-phase",
				operation_safety: "secret-safety",
				commit_state: "secret-state",
				safe_to_retry: true,
				code: "secret-code",
				status: 999,
			},
		} as unknown as SafeToolCompletion);

		const event = events[1];
		expect(event).toMatchObject({
			event: "worker.tool.completion",
			error: {
				category: "UnknownError",
				safe_to_retry: true,
				frames: [{ source: "worker", line: 1, column: 1 }],
			},
			execution: {
				outcome: "terminal_failure",
				phase: "before-dispatch",
				operation_safety: "read",
				commit_state: "not_sent",
				safe_to_retry: true,
			},
		});
		expect(JSON.stringify(event)).not.toContain("secret");
	});

	it("uses the explicit execution projection for returned errors", () => {
		const events: WorkerObservationEvent[] = [];
		const scope = createScope(events);
		void scope.finish({
			outcome: "returned_error",
			durationMs: 1,
			result: {
				isError: true,
				hasStructuredContent: true,
				contentCountBucket: "1",
			},
			errorOutcome: {
				outcome: "deadline_exceeded",
				phase: "dispatch",
				operation_safety: "read",
				commit_state: "not_sent",
				safe_to_retry: false,
				code: "HEVY_DEADLINE_EXCEEDED",
			},
		});
		expect(events[1]?.execution).toMatchObject({
			outcome: "deadline_exceeded",
			phase: "dispatch",
			code: "HEVY_DEADLINE_EXCEEDED",
		});
	});

	it("finishes at most once", () => {
		const events: WorkerObservationEvent[] = [];
		const scope = createScope(events);
		void scope.finish({ outcome: "success", durationMs: 1 });
		void scope.finish({ outcome: "thrown_error", durationMs: 2 });
		expect(
			events.filter((event) => event.event === "worker.tool.completion"),
		).toHaveLength(1);
	});

	it("isolates synchronous and asynchronous sink failures", async () => {
		const sink = vi
			.fn<(_: WorkerObservationEvent) => void | Promise<void>>()
			.mockImplementationOnce(() => {
				throw new Error("sink failure");
			})
			.mockImplementationOnce(() =>
				Promise.reject(new Error("async sink failure")),
			);
		const scope = createWorkerToolObserver({ sink }).start(invocation);
		if (!scope) throw new Error("Expected a Worker observation scope");
		await expect(scope.run(() => Promise.resolve("ok"))).resolves.toBe("ok");
		expect(() =>
			scope.finish({ outcome: "success", durationMs: 1 }),
		).not.toThrow();
		await Promise.resolve();
		expect(sink).toHaveBeenCalledTimes(2);
	});
});
