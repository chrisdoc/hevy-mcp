import { Cause, Context, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { ApiError, OperationUnavailableError } from "../effect-errors.js";
import {
	normalizeCoreCause,
	operationEffect,
	requireOperation,
} from "./operation-helpers.js";

describe("operation error normalization", () => {
	it("retains supported upstream tagged failures", async () => {
		const failure = new ApiError({
			status: 503,
			endpoint: "/v1/workouts",
			method: "GET",
		});
		const operation = {
			effect: () => Effect.fail(failure),
		};

		const result = await Effect.runPromise(
			Effect.flip(operationEffect(Effect.succeed(operation))),
		);

		expect(result).toBe(failure);
		expect(result._tag).toBe("ApiError");
	});

	it("preserves annotations when normalizing supported failures", () => {
		const failure = new ApiError({
			status: 503,
			endpoint: "/v1/workouts",
			method: "GET",
		});
		const reason = Cause.makeFailReason(failure).annotate(
			Context.makeUnsafe(new Map([["trace", "test"]])),
		);

		const normalized = normalizeCoreCause(Cause.fromReasons([reason]));

		expect(normalized.reasons[0]?.annotations).toEqual(reason.annotations);
	});

	it("fails in the Effect channel when an operation is unavailable", async () => {
		type TestOperation = {
			effect: () => Effect.Effect<void, never, never>;
		};
		const program = operationEffect(
			requireOperation<TestOperation>(undefined, "workouts.list"),
		);

		const failure = await Effect.runPromise(Effect.flip(program));

		expect(failure).toBeInstanceOf(OperationUnavailableError);
		if (failure instanceof OperationUnavailableError) {
			expect(failure.operation).toBe("workouts.list");
		}
	});

	it("turns hostile seam failures into defects without widening the handler union", async () => {
		const operation = {
			effect: () => Effect.fail({ secret: "never-render-this" }),
		};

		const exit = await Effect.runPromiseExit(
			operationEffect(Effect.succeed(operation)),
		);

		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			expect(Cause.hasDies(exit.cause)).toBe(true);
			expect(JSON.stringify(exit.cause)).toContain("never-render-this");
		}
	});
});
