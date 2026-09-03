import { describe, expect, it, vi } from "vitest";
import { Context, Effect, Layer, Option } from "effect";
import {
	ExerciseTemplateCatalogService,
	HevyClientService,
	HevyOperationsService,
	ToolExecutionContextService,
	ToolObserverService,
} from "../effect-services.js";
import { createMockHevyClient } from "../../test-fixtures/mock-hevy.js";
import {
	createToolRuntime,
	HEVY_CLIENT_NOT_INITIALIZED_ERROR,
} from "./tool-runtime.js";
import { createOperations } from "@hevy-mcp/operations";

const runImmediately = <T>(operation: () => Promise<T>): Promise<T> =>
	operation();

const catalog = {
	effect: () => Effect.succeed([]),
	get: () => Promise.resolve([]),
	reset: () => undefined,
};

function resolveRuntimeServices(runtime: ReturnType<typeof createToolRuntime>) {
	if (!runtime.layer) {
		throw new Error("Expected runtime to provide a service layer");
	}
	return Effect.runSync(Effect.scoped(Layer.build(runtime.layer)));
}

describe("createToolRuntime service layer", () => {
	it("throws the canonical not-initialized error for client service lookup without a client", () => {
		const runtime = createToolRuntime({
			client: null,
			operations: createOperations(createMockHevyClient()),
			catalog,
		});

		expect(() => runtime.service(HevyClientService)).toThrowError(
			HEVY_CLIENT_NOT_INITIALIZED_ERROR,
		);
		expect(() => runtime.getClient()).toThrowError(
			HEVY_CLIENT_NOT_INITIALIZED_ERROR,
		);
	});

	it("provides core services from the objects passed to the runtime", () => {
		const client = createMockHevyClient();
		const operations = createOperations(client);
		const execution = {
			requestId: "request-1",
			deadline: 123,
		};
		const runtime = createToolRuntime({
			client,
			operations,
			catalog,
			execution,
		});
		const services = resolveRuntimeServices(runtime);

		expect(Context.get(services, HevyClientService)).toBe(runtime.getClient());
		expect(Context.get(services, HevyOperationsService)).toBe(operations);
		expect(Context.get(services, ExerciseTemplateCatalogService)).toBe(
			runtime.catalog,
		);
		expect(Context.get(services, ToolExecutionContextService)).toBe(execution);
		expect(runtime.getClient()).toBe(Context.get(services, HevyClientService));
		expect(runtime.service(HevyClientService)).toBe(runtime.getClient());
		expect(runtime.getOperations()).toBe(
			Context.get(services, HevyOperationsService),
		);
		expect(runtime.service(HevyOperationsService)).toBe(
			runtime.getOperations(),
		);
	});

	it("composes the observer service only when an observer is configured", () => {
		const withObserver = { start: vi.fn() };
		const observedRuntime = createToolRuntime({
			client: createMockHevyClient(),
			catalog,
			observer: withObserver,
		});
		const observedServices = resolveRuntimeServices(observedRuntime);
		expect(Context.get(observedServices, ToolObserverService)).toBe(
			withObserver,
		);

		const unobservedRuntime = createToolRuntime({
			client: createMockHevyClient(),
			catalog,
		});
		const unobservedServices = resolveRuntimeServices(unobservedRuntime);
		expect(Context.getOption(unobservedServices, ToolObserverService)).toBe(
			Option.none(),
		);
	});

	it("rebinds execution-scoped client, catalog, and context without rebinding operations", () => {
		const client = createMockHevyClient();
		const operations = createOperations(client);
		const runtime = createToolRuntime({
			client,
			operations,
			catalog,
		});
		const signal = new AbortController().signal;
		const scoped = runtime.forExecution({ signal, deadline: 456 });
		const parentServices = resolveRuntimeServices(runtime);
		const scopedServices = resolveRuntimeServices(scoped);

		expect(Context.get(parentServices, HevyClientService)).toBe(client);
		expect(Context.get(scopedServices, HevyClientService)).toBe(
			scoped.getClient(),
		);
		expect(Context.get(scopedServices, HevyClientService)).not.toBe(client);
		expect(Context.get(scopedServices, ExerciseTemplateCatalogService)).toBe(
			scoped.catalog,
		);
		expect(scoped.catalog).not.toBe(catalog);
		expect(Context.get(scopedServices, ToolExecutionContextService)).toBe(
			scoped.execution,
		);
		expect(Context.get(scopedServices, HevyOperationsService)).toBe(operations);
		expect(Context.get(parentServices, ExerciseTemplateCatalogService)).toBe(
			catalog,
		);
		expect(Context.get(parentServices, HevyOperationsService)).toBe(operations);
	});
});

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

	it("cleans up fallback listeners across repeated execution scopes", () => {
		const nativeDescriptor = Object.getOwnPropertyDescriptor(
			AbortSignal,
			"any",
		);
		Object.defineProperty(AbortSignal, "any", {
			value: undefined,
			configurable: true,
		});
		try {
			const lifecycle = new AbortController();
			const removeEventListener = vi.spyOn(
				lifecycle.signal,
				"removeEventListener",
			);
			const runtime = createToolRuntime({
				client: null,
				catalog,
				lifecycleSignal: lifecycle.signal,
			});

			for (let index = 0; index < 3; index += 1) {
				const request = new AbortController();
				const scoped = runtime.forExecution({ signal: request.signal });
				request.abort();
				expect(scoped.execution?.signal?.aborted).toBe(true);
			}

			expect(removeEventListener).toHaveBeenCalledTimes(3);
		} finally {
			if (nativeDescriptor) {
				Object.defineProperty(AbortSignal, "any", nativeDescriptor);
			} else {
				Reflect.deleteProperty(AbortSignal, "any");
			}
		}
	});
});
