import { describe, expect, it, vi } from "vitest";
import type { HevyClient, HevyRequestOptions } from "@hevy-mcp/hevy-client";
import {
	bindClientExecution,
	createExecutionProjection,
	HEVY_CLIENT_OPTION_INDEXES,
} from "./execution.js";

type ClientTestArgument =
	| HevyRequestOptions
	| string
	| {
			readonly [key: string]:
				| object
				| string
				| number
				| boolean
				| null
				| undefined;
	  };
type ClientMethodArguments = {
	[K in keyof HevyClient]: ClientTestArgument[];
};

const baseArgs = {
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
} satisfies ClientMethodArguments;

describe("bindClientExecution", () => {
	it("binds unknown function properties without injecting options", () => {
		const extra = vi.fn(function (this: HevyClient) {
			return this;
		});
		const methods = {
			getWorkouts: vi.fn(),
			getWorkout: vi.fn(),
			createWorkout: vi.fn(),
			updateWorkout: vi.fn(),
			getWorkoutCount: vi.fn(),
			getWorkoutEvents: vi.fn(),
			getRoutines: vi.fn(),
			getRoutineById: vi.fn(),
			createRoutine: vi.fn(),
			updateRoutine: vi.fn(),
			getExerciseTemplates: vi.fn(),
			getExerciseTemplate: vi.fn(),
			getExerciseHistory: vi.fn(),
			createExerciseTemplate: vi.fn(),
			getRoutineFolders: vi.fn(),
			createRoutineFolder: vi.fn(),
			getRoutineFolder: vi.fn(),
			getBodyMeasurements: vi.fn(),
			getBodyMeasurement: vi.fn(),
			createBodyMeasurement: vi.fn(),
			updateBodyMeasurement: vi.fn(),
			getUserInfo: vi.fn(),
			extra,
		} satisfies HevyClient & { extra: typeof extra };

		const bound = bindClientExecution(methods, {
			deadline: 123,
		});

		expect(bound.extra()).toBe(methods);
		expect(extra).toHaveBeenCalledOnce();
	});

	it("places merged control in every curated options slot", () => {
		const methods = {
			getWorkouts: vi.fn(),
			getWorkout: vi.fn(),
			createWorkout: vi.fn(),
			updateWorkout: vi.fn(),
			getWorkoutCount: vi.fn(),
			getWorkoutEvents: vi.fn(),
			getRoutines: vi.fn(),
			getRoutineById: vi.fn(),
			createRoutine: vi.fn(),
			updateRoutine: vi.fn(),
			getExerciseTemplates: vi.fn(),
			getExerciseTemplate: vi.fn(),
			getExerciseHistory: vi.fn(),
			createExerciseTemplate: vi.fn(),
			getRoutineFolders: vi.fn(),
			createRoutineFolder: vi.fn(),
			getRoutineFolder: vi.fn(),
			getBodyMeasurements: vi.fn(),
			getBodyMeasurement: vi.fn(),
			createBodyMeasurement: vi.fn(),
			updateBodyMeasurement: vi.fn(),
			getUserInfo: vi.fn(),
		} satisfies HevyClient;
		const signal = new AbortController().signal;
		const control = {
			signal,
			deadline: 123,
		};
		const bound = bindClientExecution(methods, control);

		for (const [name, index] of Object.entries(HEVY_CLIENT_OPTION_INDEXES)) {
			const method = name as keyof HevyClient;
			const invoke = bound[method];
			const spy = methods[method];
			const args = [...baseArgs[method]];
			Reflect.apply(invoke, methods, args);
			const firstCall = spy.mock.calls.at(-1) ?? [];
			expect(firstCall[index]).toMatchObject(control);

			const existingOptions = { deadline: 456 };
			const withOptions: ClientTestArgument[] = [...baseArgs[method]];
			withOptions[index] = existingOptions;
			Reflect.apply(invoke, methods, withOptions);
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
