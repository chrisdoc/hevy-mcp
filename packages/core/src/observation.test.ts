import { describe, expect, it, vi } from "vitest";
import { memoizeObservationScope } from "./observation.js";

describe("memoizeObservationScope", () => {
	it("finishes an observation at most once", () => {
		const finish = vi.fn();
		const scope = memoizeObservationScope({
			run: (operation) => operation(),
			finish,
		});
		const completion = { outcome: "success" as const, durationMs: 1 };
		void scope?.finish(completion);
		void scope?.finish(completion);
		expect(finish).toHaveBeenCalledTimes(1);
	});

	it("isolates synchronous and asynchronous observer failures", async () => {
		const sync = memoizeObservationScope({
			run: (operation) => operation(),
			finish: () => {
				throw new Error("observer failure");
			},
		});
		expect(() =>
			sync?.finish({ outcome: "success", durationMs: 1 }),
		).not.toThrow();

		const asyncScope = memoizeObservationScope({
			run: (operation) => operation(),
			finish: async () => Promise.reject(new Error("observer rejection")),
		});
		void asyncScope?.finish({ outcome: "success", durationMs: 1 });
		await Promise.resolve();
	});
});
