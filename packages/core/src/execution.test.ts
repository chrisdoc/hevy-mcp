import { describe, expect, it, vi } from "vitest";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import {
	bindClientExecution,
	createExecutionProjection,
	HEVY_CLIENT_OPTION_INDEXES,
} from "./execution.js";

const baseArgs: { [K in keyof HevyClient]: unknown[] } = {
	getWorkouts: [{ page: 1 }],
	getWorkout: ["workout-1"],
	createWorkout: [{ workout: {} }],
	updateWorkout: ["workout-1", { workout: {} }],
	getWorkoutCount: [],
	getWorkoutEvents: [{ page: 1 }],
	getRoutines: [{ page: 1 }],
	getRoutineById: ["routine-1"],
	createRoutine: [{ routine: {} }],
	updateRoutine: ["routine-1", { routine: {} }],
	getExerciseTemplates: [{ page: 1 }],
	getExerciseTemplate: ["template-1"],
	getExerciseHistory: ["template-1", { page: 1 }],
	createExerciseTemplate: [{ exercise: {} }],
	getRoutineFolders: [{ page: 1 }],
	createRoutineFolder: [{ folder: {} }],
	getRoutineFolder: ["folder-1"],
	getBodyMeasurements: [{ page: 1 }],
	getBodyMeasurement: ["2025-01-01"],
	createBodyMeasurement: [{ body_measurement: {} }],
	updateBodyMeasurement: ["2025-01-01", { body_measurement: {} }],
	getUserInfo: [],
};

describe("bindClientExecution", () => {
	it("binds unknown function properties without injecting options", () => {
		const extra = vi.fn(function (this: object) {
			return this;
		});
		const methods = {
			...Object.fromEntries(
				Object.keys(HEVY_CLIENT_OPTION_INDEXES).map((name) => [name, vi.fn()]),
			),
			extra,
		} as unknown as HevyClient & { extra: typeof extra };

		const bound = bindClientExecution(methods, {
			deadline: 123,
		}) as typeof methods;

		expect(bound.extra()).toBe(methods);
		expect(extra).toHaveBeenCalledOnce();
	});

	it("places merged control in every curated options slot", () => {
		const methods = Object.fromEntries(
			Object.keys(HEVY_CLIENT_OPTION_INDEXES).map((name) => [name, vi.fn()]),
		) as unknown as HevyClient;
		const signal = new AbortController().signal;
		const control = {
			signal,
			deadline: 123,
		};
		const bound = bindClientExecution(methods, control) as unknown as Record<
			string,
			(...args: unknown[]) => unknown
		>;

		for (const [name, index] of Object.entries(HEVY_CLIENT_OPTION_INDEXES)) {
			const method = name as keyof HevyClient;
			const invoke = bound[name];
			const spy = (
				methods as unknown as Record<string, ReturnType<typeof vi.fn>>
			)[name];
			const args = [...baseArgs[method]];
			invoke(...args);
			const firstCall = spy.mock.calls.at(-1) ?? [];
			expect(firstCall[index]).toMatchObject(control);

			const existingOptions = { deadline: 456 };
			const withOptions = [...baseArgs[method]];
			withOptions[index] = existingOptions;
			invoke(...withOptions);
			const secondCall = spy.mock.calls.at(-1) ?? [];
			expect(secondCall[index]).toMatchObject({
				...existingOptions,
				...control,
			});
			for (let i = 0; i < withOptions.length; i += 1) {
				if (i === index) continue;
				expect(secondCall[i]).toBe(withOptions[i]);
			}
		}
	});

	it("provides privacy-safe execution defaults for every adapter", () => {
		expect(createExecutionProjection({ outcome: "cancelled" })).toEqual({
			outcome: "cancelled",
			phase: "before-dispatch",
			operation_safety: "read",
			commit_state: "not_sent",
			safe_to_retry: false,
		});
	});
});
