import { describe, expect, it, vi } from "vitest";
import { createMockHevyClient } from "../../test-fixtures/mock-hevy.js";
import { createToolRuntime } from "./tool-runtime.js";

const runImmediately = <T>(operation: () => Promise<T>): Promise<T> =>
	operation();

const catalog = {
	get: () => Promise.resolve([]),
	reset: () => undefined,
};

describe("createToolRuntime observation scope", () => {
	it("does not execute a write handler twice when run instrumentation fails", async () => {
		let executions = 0;
		const finish = vi.fn();
		const runtime = createToolRuntime({
			client: null,
			catalog,
			observer: {
				start: () => ({
					run: () => {
						throw new Error("instrumentation failed");
					},
					finish,
				}),
			},
		});
		const handler = runtime.createHandler(() => {
			executions += 1;
			return Promise.resolve({ content: [{ type: "text", text: "ok" }] });
		}, "create-workout");

		await expect(handler({ id: "workout-id" })).resolves.toMatchObject({
			content: [{ text: "ok" }],
		});
		expect(executions).toBe(1);
		expect(finish).toHaveBeenCalledOnce();
	});

	it("starts the handler lazily inside the active observer scope", async () => {
		let active = false;
		const handler = vi.fn(() => {
			expect(active).toBe(true);
			return Promise.resolve({
				content: [{ type: "text" as const, text: "ok" }],
			});
		});
		let runCalls = 0;
		const run = async <T>(operation: () => Promise<T>): Promise<T> => {
			runCalls += 1;
			active = true;
			try {
				return await operation();
			} finally {
				active = false;
			}
		};
		const runtime = createToolRuntime({
			client: null,
			catalog,
			observer: { start: () => ({ run, finish: vi.fn() }) },
		});
		await runtime.createHandler(handler, "get-workout")({ workout_id: "id" });

		expect(runCalls).toBe(1);
		expect(handler).toHaveBeenCalledOnce();
	});

	it("reuses the handler result when run fails after invoking it", async () => {
		const handler = vi
			.fn()
			.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
		const runtime = createToolRuntime({
			client: null,
			catalog,
			observer: {
				start: () => ({
					run: async (operation) => {
						await operation();
						throw new Error("observer failed after execution");
					},
					finish: vi.fn(),
				}),
			},
		});

		await expect(
			runtime.createHandler(handler, "create-workout")({}),
		).resolves.toMatchObject({ content: [{ text: "ok" }] });
		expect(handler).toHaveBeenCalledOnce();
	});

	it("emits only allowlisted taxonomy and bounded argument structure", async () => {
		const start = vi.fn(() => ({
			run: runImmediately,
			finish: vi.fn(),
		}));
		const runtime = createToolRuntime({
			client: null,
			catalog,
			observer: { start },
		});
		const secret = "private-routine-title-sentinel";
		const handler = runtime.createHandler(
			() => Promise.resolve({ content: [] }),
			"list-routines",
			{ feature: "routines", kind: "read", operation: "list" },
		);

		await handler({
			page: 12,
			page_size: 5,
			query: secret,
			workout_id: "private-workout-id",
			include_custom: true,
			private_note: secret,
		});

		expect(start).toHaveBeenCalledWith({
			name: "list-routines",
			taxonomy: { feature: "routines", kind: "read", operation: "list" },
			argumentKeys: [
				"page",
				"page_size",
				"workout_id",
				"include_custom",
				"query",
			],
			argumentPresence: { workout_id: true, query: true },
			numericArgumentBuckets: { page: "11-50", page_size: "2-10" },
			booleanArguments: { include_custom: true },
			argumentKeyCountBucket: "2-10",
		});
		expect(JSON.stringify(start.mock.calls)).not.toContain(secret);
		expect(JSON.stringify(start.mock.calls)).not.toContain(
			"private-workout-id",
		);
		expect(JSON.stringify(start.mock.calls)).not.toContain("privateNote");
	});

	it("reports bounded result content counts", async () => {
		const finish = vi.fn();
		const runtime = createToolRuntime({
			client: null,
			catalog,
			observer: {
				start: () => ({
					run: (operation) => operation(),
					finish,
				}),
			},
		});
		const content = Array.from({ length: 12 }, (_, index) => ({
			type: "text" as const,
			text: `result-${index}`,
		}));

		await runtime.createHandler(
			() => Promise.resolve({ content }),
			"list-workouts",
		)({});

		expect(finish).toHaveBeenCalledWith(
			expect.objectContaining({
				result: expect.objectContaining({ contentCountBucket: "11-50" }),
			}),
		);
		expect(JSON.stringify(finish.mock.calls)).not.toContain(
			'"contentCount":12',
		);
	});

	it("reports a safe thrown-error diagnostic without exception text", async () => {
		const finish = vi.fn();
		const secret = "private-handler-error-sentinel";
		const runtime = createToolRuntime({
			client: null,
			catalog,
			observer: {
				start: () => ({
					run: (operation) => operation(),
					finish,
				}),
			},
		});
		const stderr = vi.spyOn(console, "error").mockImplementation(() => {});

		const result = await runtime.createHandler(
			() => Promise.reject(new Error(secret)),
			"get-workouts",
		)({});

		expect(result).toMatchObject({ isError: true });
		expect(finish).toHaveBeenCalledWith(
			expect.objectContaining({
				outcome: "thrown_error",
				errorType: "UNKNOWN_ERROR",
				error: expect.objectContaining({ category: "Error" }),
			}),
		);
		expect(JSON.stringify(finish.mock.calls)).not.toContain(secret);
		stderr.mockRestore();
	});

	it("lets the newest nested execution scope control the client", async () => {
		const client = createMockHevyClient();
		const getUserInfo = client.getUserInfo.mockResolvedValue({
			data: { id: "user" },
		});
		const runtime = createToolRuntime({ client, catalog });
		const firstSignal = new AbortController().signal;
		const secondSignal = new AbortController().signal;
		const first = runtime.forExecution({
			signal: firstSignal,
			deadline: 111,
		});
		const second = first.forExecution({
			signal: secondSignal,
			deadline: 222,
		});

		expect(second.executionDeadline).toBe(222);
		await second.getClient().getUserInfo();

		expect(getUserInfo).toHaveBeenCalledWith({
			signal: secondSignal,
			deadline: 222,
		});
	});
});
