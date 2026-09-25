import { describe, expect, it, vi } from "vitest";
import { memoizeObservationScope } from "./observation.js";

const runImmediately = <T>(operation: () => Promise<T>): Promise<T> =>
	operation();

describe("memoizeObservationScope", () => {
	it("delegates through the observer run scope and memoizes its result", async () => {
		const operation = vi.fn().mockResolvedValue("result");
		let runCalls = 0;
		const run = <T>(next: () => Promise<T>): Promise<T> => {
			runCalls += 1;
			return next();
		};
		const scope = memoizeObservationScope({ run, finish: vi.fn() });

		await expect(scope?.run(operation)).resolves.toBe("result");
		await expect(scope?.run(operation)).resolves.toBe("result");

		expect(runCalls).toBe(1);
		expect(operation).toHaveBeenCalledOnce();
	});

	it("converts synchronous run failures into a memoized rejection", async () => {
		const runFailure = new Error("instrumentation failed");
		const scope = memoizeObservationScope({
			run: () => {
				throw runFailure;
			},
			finish: vi.fn(),
		});

		await expect(scope?.run(vi.fn())).rejects.toBe(runFailure);
		await expect(scope?.run(vi.fn())).rejects.toBe(runFailure);
	});

	it("finishes an observation at most once", () => {
		const finish = vi.fn();
		const scope = memoizeObservationScope({
			run: runImmediately,
			finish,
		});
		const completion = { outcome: "success" as const, durationMs: 1 };
		void scope?.finish(completion);
		void scope?.finish(completion);
		expect(finish).toHaveBeenCalledTimes(1);
	});

	it("isolates synchronous and asynchronous observer failures", async () => {
		const sync = memoizeObservationScope({
			run: runImmediately,
			finish: () => {
				throw new Error("observer failure");
			},
		});
		expect(() =>
			sync?.finish({ outcome: "success", durationMs: 1 }),
		).not.toThrow();

		const asyncScope = memoizeObservationScope({
			run: runImmediately,
			finish: async () => Promise.reject(new Error("observer rejection")),
		});
		void asyncScope?.finish({ outcome: "success", durationMs: 1 });
		await Promise.resolve();
	});
});
