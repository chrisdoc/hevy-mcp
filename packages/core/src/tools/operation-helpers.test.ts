import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { ApiError } from "../effect-errors.js";
import { operationEffect } from "./operation-helpers.js";

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
			Effect.flip(operationEffect(operation)),
		);

		expect(result).toBe(failure);
		expect(result._tag).toBe("ApiError");
	});

	it("turns hostile seam failures into defects without widening the handler union", async () => {
		const operation = {
			effect: () => Effect.fail({ secret: "never-render-this" }),
		};

		const exit = await Effect.runPromiseExit(operationEffect(operation));

		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			expect(Cause.hasDies(exit.cause)).toBe(true);
			expect(JSON.stringify(exit.cause)).toContain("never-render-this");
		}
	});
});
