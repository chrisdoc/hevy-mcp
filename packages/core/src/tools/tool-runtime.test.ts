import { describe, expect, it, vi } from "vitest";
import { createToolRuntime } from "./tool-runtime.js";

describe("createToolRuntime observation scope", () => {
	it("does not execute a write handler twice when run instrumentation fails", async () => {
		let executions = 0;
		const finish = vi.fn();
		const runtime = createToolRuntime({
			client: null,
			catalog: {
				get: async () => [],
				reset: () => undefined,
			},
			observer: {
				start: () => ({
					run: () => {
						throw new Error("instrumentation failed");
					},
					finish,
				}),
			},
		});
		const handler = runtime.createHandler(async () => {
			executions += 1;
			return { content: [{ type: "text", text: "ok" }] };
		}, "create-workout");

		await expect(handler({ id: "workout-id" })).resolves.toMatchObject({
			content: [{ text: "ok" }],
		});
		expect(executions).toBe(1);
		expect(finish).toHaveBeenCalledOnce();
	});
});
