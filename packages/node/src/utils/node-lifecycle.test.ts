import type { SpanOptions } from "@opentelemetry/api";
import { afterEach, describe, expect, it, vi } from "vitest";

const doubles = vi.hoisted(() => ({
	cleanup: vi.fn(),
	flush: vi.fn().mockImplementation(() => Promise.resolve()),
	capture: vi.fn(),
	startup: { add: vi.fn() },
	schedule: vi.fn(),
	shutdown: vi.fn(),
	termination: vi.fn(),
	exceptionInstall: vi.fn(),
	span: {
		addEvent: vi.fn(),
		setStatus: vi.fn(),
		end: vi.fn(),
	},
}));

vi.mock("./telemetry.js", () => ({
	captureFailure: doubles.capture,
	flushTelemetry: doubles.flush,
	installProcessExceptionTracking: doubles.exceptionInstall,
	telemetryLayer: undefined,
	serviceName: "hevy-mcp",
	serviceVersion: "test-version",
	tracer: {
		startActiveSpan: vi.fn(
			(
				_name: string,
				_options: SpanOptions,
				callback: (span: typeof doubles.span) => unknown,
			) => callback(doubles.span),
		),
	},
}));
vi.mock("./metrics.js", () => ({ serverStartups: doubles.startup }));
vi.mock("./version-check.js", () => ({
	scheduleUpdateCheck: doubles.schedule,
}));
vi.mock("./graceful-shutdown.js", () => ({
	installGracefulShutdown: doubles.shutdown,
}));

import { runNodeLifecycle } from "./node-lifecycle.js";

const target = {
	close: vi.fn().mockImplementation(() => Promise.resolve()),
};

afterEach(() => {
	vi.clearAllMocks();
	target.close.mockImplementation(() => Promise.resolve());
	doubles.exceptionInstall.mockImplementation(() => doubles.cleanup);
	doubles.shutdown.mockImplementation(() => undefined);
});

doubles.exceptionInstall.mockImplementation(() => doubles.cleanup);

describe("Node lifecycle runner", () => {
	it("starts, schedules updates, and installs shutdown ownership", async () => {
		await runNodeLifecycle({
			transport: "http",
			start: (context) => {
				context.markListening();
				return Promise.resolve({ target });
			},
		});

		expect(doubles.startup.add).toHaveBeenCalledWith(1, {
			version: "test-version",
		});
		expect(doubles.schedule).toHaveBeenCalledWith({
			packageName: "hevy-mcp",
			currentVersion: "test-version",
		});
		expect(doubles.shutdown).toHaveBeenCalledWith(
			expect.objectContaining({ target }),
		);
	});

	it("classifies startup failures without a listening state", async () => {
		const error = new Error("startup failure");
		const onFailure = vi.fn();

		await expect(
			runNodeLifecycle({
				transport: "http",
				start: () => Promise.reject(error),
				onFailure,
			}),
		).rejects.toBe(error);

		expect(onFailure).toHaveBeenCalledWith("startup_failure", {
			transport: "http",
			listening: false,
		});
		expect(doubles.capture).toHaveBeenCalledWith(
			error,
			expect.objectContaining({ kind: "lifecycle" }),
		);
		expect(doubles.cleanup).toHaveBeenCalledOnce();
	});

	it("closes a partially adopted target when startup fails", async () => {
		const partial = { close: vi.fn().mockResolvedValue(undefined) };
		const error = new Error("listen failed");

		await expect(
			runNodeLifecycle({
				transport: "http",
				start: (context) => {
					context.adoptTarget(partial);
					return Promise.reject(error);
				},
			}),
		).rejects.toBe(error);

		expect(partial.close).toHaveBeenCalledOnce();
	});

	it("classifies a runtime failure after HTTP listening", async () => {
		const onFailure = vi.fn();

		await expect(
			runNodeLifecycle({
				transport: "http",
				start: (context) => {
					context.markListening();
					return Promise.reject(new Error("runtime failure"));
				},
				onFailure,
			}),
		).rejects.toThrow("runtime failure");

		expect(onFailure).toHaveBeenCalledWith("runtime_failure", {
			transport: "http",
			listening: true,
		});
		expect(doubles.termination).not.toHaveBeenCalled();
	});

	it("keeps stdio connect failures distinct from startup failures", async () => {
		const onFailure = vi.fn();

		await expect(
			runNodeLifecycle({
				transport: "stdio",
				start: (context) => {
					context.markConnectAttempted();
					return Promise.reject(new Error("connect failure"));
				},
				onFailure,
			}),
		).rejects.toThrow("connect failure");

		expect(onFailure).toHaveBeenCalledWith("connect_failure", {
			transport: "stdio",
			connectAttempted: true,
			connectSucceeded: false,
		});
		expect(doubles.termination).not.toHaveBeenCalled();
	});

	it("keeps an HTTP session controller independent from process shutdown", async () => {
		let processSignal: AbortSignal | undefined;
		let sessionSignal: AbortSignal | undefined;
		// Mirrors how startStreamableHttpServer mints a per-session
		// lifecycleController that is independent of the process-wide signal.
		const sessionController = new AbortController();
		const mockServerFactory = vi.fn(
			({ lifecycleSignal }: { lifecycleSignal?: AbortSignal }) => {
				sessionSignal = lifecycleSignal;
				return Promise.resolve({ close: vi.fn(), connect: vi.fn() });
			},
		);

		await runNodeLifecycle({
			transport: "http",
			start: async ({ signal }) => {
				processSignal = signal;
				await mockServerFactory({ lifecycleSignal: sessionController.signal });
				return Promise.resolve({ target });
			},
		});

		const options = doubles.shutdown.mock.calls[0]?.[0] as {
			cancel: AbortController;
		};
		options.cancel.abort();
		expect(mockServerFactory).toHaveBeenCalledOnce();
		expect(processSignal).toBeDefined();
		expect(sessionSignal).toBeDefined();
		expect(processSignal).not.toBe(sessionSignal);
		expect(processSignal?.aborted).toBe(true);
		// Aborting the process-wide lifecycle controller must not cascade into
		// the independently-owned session controller.
		expect(sessionSignal?.aborted).toBe(false);
		expect(sessionController.signal.aborted).toBe(false);
	});

	it("flushes telemetry and cleans process tracking on shutdown", async () => {
		await runNodeLifecycle({
			transport: "stdio",
			start: (context) => {
				context.markConnectAttempted();
				context.markConnectSucceeded();
				return Promise.resolve({
					target,
					onShutdown: (succeeded) =>
						doubles.termination(succeeded ? "clean" : "shutdown_failure"),
				});
			},
		});

		const options = doubles.shutdown.mock.calls[0]?.[0] as {
			onComplete: (succeeded: boolean) => Promise<void>;
		};
		await options.onComplete(true);

		expect(doubles.termination).toHaveBeenCalledWith("clean");
		expect(doubles.cleanup).toHaveBeenCalledOnce();
		expect(doubles.flush).toHaveBeenCalledOnce();
	});

	it("preserves a shutdown registration failure and cleans prior acquisitions once", async () => {
		const registrationError = new Error("shutdown registration failed");
		const partial = { close: vi.fn().mockResolvedValue(undefined) };
		doubles.shutdown.mockImplementation(() => {
			throw registrationError;
		});

		await expect(
			runNodeLifecycle({
				transport: "http",
				start: (context) => {
					context.adoptTarget(partial);
					context.markListening();
					return Promise.resolve({ target: partial });
				},
			}),
		).rejects.toBe(registrationError);

		expect(partial.close).toHaveBeenCalledOnce();
		expect(doubles.cleanup).toHaveBeenCalledOnce();
		expect(doubles.schedule).toHaveBeenCalledOnce();
	});

	it("preserves an exception-listener registration failure", async () => {
		const registrationError = new Error(
			"unhandledRejection registration failed",
		);
		doubles.exceptionInstall.mockImplementation(() => {
			throw registrationError;
		});

		await expect(
			runNodeLifecycle({
				transport: "http",
				start: () => Promise.resolve({ target }),
			}),
		).rejects.toBe(registrationError);

		expect(doubles.schedule).not.toHaveBeenCalled();
		expect(target.close).not.toHaveBeenCalled();
	});
});
