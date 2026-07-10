import { describe, expect, it, vi } from "vitest";
import {
	FORCED_EXIT_TIMEOUT_MS,
	flushStdout,
	installGracefulShutdown,
	type ShutdownSignal,
} from "./graceful-shutdown.js";

class FakeProcess {
	exitCode: number | string | null | undefined;
	readonly exit = vi.fn((_code?: number | string | null) => undefined as never);
	readonly listeners = new Map<ShutdownSignal, Set<() => void>>();

	on(signal: ShutdownSignal, listener: () => void) {
		const listeners = this.listeners.get(signal) ?? new Set();
		listeners.add(listener);
		this.listeners.set(signal, listeners);
		return this;
	}

	removeListener(signal: ShutdownSignal, listener: () => void) {
		this.listeners.get(signal)?.delete(listener);
		return this;
	}

	emit(signal: ShutdownSignal) {
		for (const listener of this.listeners.get(signal) ?? []) {
			listener();
		}
	}

	listenerCount(signal: ShutdownSignal) {
		return this.listeners.get(signal)?.size ?? 0;
	}
}

describe("installGracefulShutdown", () => {
	it("registers both signals and shuts down in close-then-flush order", async () => {
		const process = new FakeProcess();
		const events: string[] = [];
		const controller = installGracefulShutdown({
			target: {
				close: vi.fn(async () => {
					events.push("close");
				}),
			},
			process,
			logError: (message) => events.push(`stderr:${message}`),
			flush: vi.fn(async () => {
				events.push("flush");
			}),
		});

		expect(process.listenerCount("SIGINT")).toBe(1);
		expect(process.listenerCount("SIGTERM")).toBe(1);

		process.emit("SIGTERM");
		await controller.getShutdownPromise();

		expect(events).toEqual([
			"stderr:Shutting down gracefully after SIGTERM",
			"close",
			"flush",
		]);
		expect(process.exitCode).toBe(0);
		expect(process.listenerCount("SIGINT")).toBe(0);
		expect(process.listenerCount("SIGTERM")).toBe(0);
	});

	it.each(["SIGINT", "SIGTERM"] satisfies ShutdownSignal[])(
		"handles %s",
		async (signal) => {
			const process = new FakeProcess();
			const close = vi.fn().mockResolvedValue(undefined);
			const controller = installGracefulShutdown({
				target: { close },
				process,
				logError: vi.fn(),
				flush: vi.fn().mockResolvedValue(undefined),
			});

			process.emit(signal);
			await controller.getShutdownPromise();

			expect(close).toHaveBeenCalledTimes(1);
			expect(process.exitCode).toBe(0);
		},
	);

	it("ignores duplicate signals while shutdown is pending", async () => {
		const process = new FakeProcess();
		const closeDeferred = Promise.withResolvers<void>();
		const close = vi.fn(() => closeDeferred.promise);
		const flush = vi.fn().mockResolvedValue(undefined);
		const controller = installGracefulShutdown({
			target: { close },
			process,
			logError: vi.fn(),
			flush,
		});

		process.emit("SIGTERM");
		const shutdownPromise = controller.getShutdownPromise();
		process.emit("SIGINT");
		controller.cleanup();

		expect(close).toHaveBeenCalledTimes(1);
		expect(flush).not.toHaveBeenCalled();
		expect(process.listenerCount("SIGINT")).toBe(1);
		expect(process.listenerCount("SIGTERM")).toBe(1);

		closeDeferred.resolve();
		await shutdownPromise;

		expect(flush).toHaveBeenCalledTimes(1);
		expect(process.listenerCount("SIGINT")).toBe(0);
		expect(process.listenerCount("SIGTERM")).toBe(0);
	});

	it("exposes idempotent cleanup before shutdown begins", () => {
		const process = new FakeProcess();
		const controller = installGracefulShutdown({
			target: { close: vi.fn().mockResolvedValue(undefined) },
			process,
			logError: vi.fn(),
			flush: vi.fn().mockResolvedValue(undefined),
		});

		controller.cleanup();
		controller.cleanup();

		expect(process.listenerCount("SIGINT")).toBe(0);
		expect(process.listenerCount("SIGTERM")).toBe(0);
		expect(controller.getShutdownPromise()).toBeUndefined();
	});

	it.each([
		["close", vi.fn().mockRejectedValue(new Error("close failed"))],
		["flush", vi.fn().mockResolvedValue(undefined)],
	] as const)(
		"handles %s failure and cleans listeners",
		async (failure, close) => {
			const process = new FakeProcess();
			const logError = vi.fn();
			const flush =
				failure === "flush"
					? vi.fn().mockRejectedValue(new Error("flush failed"))
					: vi.fn().mockResolvedValue(undefined);
			const controller = installGracefulShutdown({
				target: { close },
				process,
				logError,
				flush,
			});

			process.emit("SIGINT");
			await controller.getShutdownPromise();

			expect(process.exitCode).toBe(1);
			expect(flush).toHaveBeenCalledTimes(1);
			expect(logError).toHaveBeenLastCalledWith(
				`Graceful shutdown failed: ${failure} failed`,
			);
			expect(process.listenerCount("SIGINT")).toBe(0);
			expect(process.listenerCount("SIGTERM")).toBe(0);
		},
	);

	it("treats a falsy rejection value as a shutdown failure", async () => {
		const process = new FakeProcess();
		const logError = vi.fn();
		const controller = installGracefulShutdown({
			target: { close: vi.fn().mockRejectedValue(undefined) },
			process,
			logError,
			flush: vi.fn().mockResolvedValue(undefined),
		});

		process.emit("SIGTERM");
		await controller.getShutdownPromise();

		expect(process.exitCode).toBe(1);
		expect(logError).toHaveBeenLastCalledWith(
			"Graceful shutdown failed: Unknown shutdown error",
		);
	});

	it("preserves a pre-existing nonzero exit code after successful shutdown", async () => {
		const process = new FakeProcess();
		process.exitCode = 2;
		let forceExit: (() => void) | undefined;
		const controller = installGracefulShutdown({
			target: { close: vi.fn().mockResolvedValue(undefined) },
			process,
			logError: vi.fn(),
			flush: vi.fn().mockResolvedValue(undefined),
			scheduleForcedExit: (callback) => {
				forceExit = callback;
				return { unref: vi.fn() };
			},
		});

		process.emit("SIGTERM");
		await controller.getShutdownPromise();
		forceExit?.();

		expect(process.exitCode).toBe(2);
		expect(process.exit).toHaveBeenCalledWith(2);
	});

	it("unrefs one bounded fallback that exits with the latest status", async () => {
		const process = new FakeProcess();
		const closeDeferred = Promise.withResolvers<void>();
		let forceExit: (() => void) | undefined;
		const unref = vi.fn();
		const scheduleForcedExit = vi.fn(
			(callback: () => void, _timeoutMs: number) => {
				forceExit = callback;
				return { unref };
			},
		);
		const controller = installGracefulShutdown({
			target: { close: vi.fn(() => closeDeferred.promise) },
			process,
			logError: vi.fn(),
			flush: vi.fn().mockResolvedValue(undefined),
			scheduleForcedExit,
		});

		process.emit("SIGTERM");
		process.emit("SIGINT");

		expect(scheduleForcedExit).toHaveBeenCalledTimes(1);
		expect(scheduleForcedExit).toHaveBeenCalledWith(
			expect.any(Function),
			FORCED_EXIT_TIMEOUT_MS,
		);
		expect(unref).toHaveBeenCalledTimes(1);
		expect(process.exitCode).toBe(0);

		process.exitCode = 7;
		forceExit?.();
		expect(process.exit).toHaveBeenCalledWith(7);

		closeDeferred.resolve();
		await controller.getShutdownPromise();
	});

	it("uses a shutdown failure selected after the fallback was scheduled", async () => {
		const process = new FakeProcess();
		let forceExit: (() => void) | undefined;
		const controller = installGracefulShutdown({
			target: { close: vi.fn().mockRejectedValue(new Error("close failed")) },
			process,
			logError: vi.fn(),
			flush: vi.fn().mockResolvedValue(undefined),
			scheduleForcedExit: (callback) => {
				forceExit = callback;
				return { unref: vi.fn() };
			},
		});

		process.emit("SIGINT");
		await controller.getShutdownPromise();
		forceExit?.();

		expect(process.exitCode).toBe(1);
		expect(process.exit).toHaveBeenCalledWith(1);
	});
});

describe("flushStdout", () => {
	it("queues a zero-byte write and resolves from its callback", async () => {
		const write = vi.fn(
			(_chunk: string, callback: (error?: Error | null) => void) => {
				callback();
				return false;
			},
		);

		await expect(flushStdout({ write })).resolves.toBeUndefined();
		expect(write).toHaveBeenCalledWith("", expect.any(Function));
	});

	it("rejects callback and synchronous write errors", async () => {
		const callbackError = new Error("callback failed");
		const callbackWrite = (
			_chunk: string,
			callback: (error?: Error | null) => void,
		) => {
			callback(callbackError);
			return false;
		};
		const synchronousError = new Error("write failed");
		const throwingWrite = () => {
			throw synchronousError;
		};

		await expect(flushStdout({ write: callbackWrite })).rejects.toBe(
			callbackError,
		);
		await expect(flushStdout({ write: throwingWrite })).rejects.toBe(
			synchronousError,
		);
	});
});
