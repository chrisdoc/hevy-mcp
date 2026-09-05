import { describe, expect, it, vi } from "vitest";
import {
	installGracefulShutdown,
	type ShutdownSignal,
} from "./graceful-shutdown.js";

class FakeProcess {
	exitCode: number | string | null | undefined;
	readonly exit = vi.fn((_code?: number | string | null) => undefined as never);
	readonly listeners = new Map<ShutdownSignal, Set<() => void>>();
	failOnSignal: ShutdownSignal | undefined;
	failOnRemovalSignal: ShutdownSignal | undefined;
	readonly removeCalls: ShutdownSignal[] = [];

	on(signal: ShutdownSignal, listener: () => void) {
		if (signal === this.failOnSignal) {
			throw new Error(`failed to install ${signal}`);
		}
		const listeners = this.listeners.get(signal) ?? new Set();
		listeners.add(listener);
		this.listeners.set(signal, listeners);
		return this;
	}

	removeListener(signal: ShutdownSignal, listener: () => void) {
		this.removeCalls.push(signal);
		if (signal === this.failOnRemovalSignal) {
			throw new Error(`failed to remove ${signal}`);
		}
		this.listeners.get(signal)?.delete(listener);
		return this;
	}

	listenerCount(signal: ShutdownSignal) {
		return this.listeners.get(signal)?.size ?? 0;
	}

	emit(signal: ShutdownSignal) {
		for (const listener of this.listeners.get(signal) ?? []) listener();
	}
}

describe("package-local graceful shutdown", () => {
	it("forces exit 1 when close does not settle within the deadline", async () => {
		vi.useFakeTimers();
		try {
			const process = new FakeProcess();
			const controller = installGracefulShutdown({
				target: { close: () => new Promise<void>(() => {}) },
				process,
				flush: vi.fn().mockResolvedValue(undefined),
			});

			process.emit("SIGTERM");
			await vi.advanceTimersByTimeAsync(4_999);
			expect(process.exit).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			await controller.getShutdownPromise();

			expect(process.exit).toHaveBeenCalledWith(1);
			expect(process.listenerCount("SIGTERM")).toBe(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it("closes, flushes, and removes signal listeners in order", async () => {
		const process = new FakeProcess();
		const events: string[] = [];
		const controller = installGracefulShutdown({
			target: {
				close: vi.fn(() => {
					events.push("close");
					return Promise.resolve();
				}),
			},
			process,
			logError: (message) => events.push(message),
			flush: vi.fn(() => {
				events.push("flush");
				return Promise.resolve();
			}),
		});

		process.emit("SIGTERM");
		await controller.getShutdownPromise();

		expect(events).toEqual([
			"Shutting down gracefully after SIGTERM",
			"close",
			"flush",
		]);
		expect(process.listenerCount("SIGTERM")).toBe(0);
		expect(process.exitCode).toBe(0);
	});

	it("does not execute close twice for duplicate signals", async () => {
		const process = new FakeProcess();
		const close = vi.fn().mockResolvedValue(undefined);
		const controller = installGracefulShutdown({
			target: { close },
			process,
			flush: vi.fn().mockResolvedValue(undefined),
		});

		process.emit("SIGTERM");
		process.emit("SIGINT");
		await controller.getShutdownPromise();

		expect(close).toHaveBeenCalledOnce();
	});

	it("shares direct close with later signals and aborts active work", async () => {
		const process = new FakeProcess();
		const cancel = new AbortController();
		const close = vi.fn().mockResolvedValue(undefined);
		const controller = installGracefulShutdown({
			target: { close },
			process,
			cancel,
			flush: vi.fn().mockResolvedValue(undefined),
		});

		const directClose = controller.close();
		process.emit("SIGTERM");
		await directClose;
		await controller.getShutdownPromise();

		expect(cancel.signal.aborted).toBe(true);
		expect(close).toHaveBeenCalledOnce();
		expect(process.listenerCount("SIGINT")).toBe(0);
		expect(process.listenerCount("SIGTERM")).toBe(0);
	});

	it("preserves a rejecting direct close as the shared completion", async () => {
		const process = new FakeProcess();
		const failure = new Error("close failed");
		const close = vi.fn().mockRejectedValue(failure);
		const controller = installGracefulShutdown({
			target: { close },
			process,
			flush: vi.fn().mockResolvedValue(undefined),
		});

		const completion = controller.close();
		process.emit("SIGINT");
		await expect(completion).rejects.toBe(failure);
		await expect(controller.getShutdownPromise()).rejects.toBe(failure);
		expect(close).toHaveBeenCalledOnce();
	});

	it("aborts active execution before closing the server", async () => {
		const process = new FakeProcess();
		const cancel = new AbortController();
		const close = vi.fn().mockResolvedValue(undefined);
		const controller = installGracefulShutdown({
			target: { close },
			process,
			cancel,
			flush: vi.fn().mockResolvedValue(undefined),
		});

		process.emit("SIGINT");
		await controller.getShutdownPromise();

		expect(cancel.signal.aborted).toBe(true);
		expect(close).toHaveBeenCalledOnce();
	});

	it("releases pending Hevy work before forced shutdown cleanup", async () => {
		const process = new FakeProcess();
		const cancel = new AbortController();
		let activeSettled = false;
		const activeWork = new Promise<void>((resolve) => {
			cancel.signal.addEventListener(
				"abort",
				() => {
					activeSettled = true;
					resolve();
				},
				{ once: true },
			);
		});
		const close = vi.fn(async () => {
			await activeWork;
		});
		const controller = installGracefulShutdown({
			target: { close },
			process,
			cancel,
			flush: vi.fn().mockResolvedValue(undefined),
		});

		process.emit("SIGTERM");
		await controller.getShutdownPromise();

		expect(activeSettled).toBe(true);
		expect(close).toHaveBeenCalledOnce();
	});

	it("rolls back only newly installed listeners when a later registration fails", () => {
		const process = new FakeProcess();
		const baseline = () => undefined;
		process.on("SIGINT", baseline);
		process.failOnSignal = "SIGTERM";
		expect(() =>
			installGracefulShutdown({
				target: { close: vi.fn().mockResolvedValue(undefined) },
				process,
			}),
		).toThrow("failed to install SIGTERM");

		expect(process.listenerCount("SIGINT")).toBe(1);
		expect(process.listenerCount("SIGTERM")).toBe(0);
		expect(process.removeCalls).toEqual(["SIGINT"]);
	});

	it("preserves the registration error when rollback removal fails", () => {
		const process = new FakeProcess();
		const baseline = () => undefined;
		process.on("SIGINT", baseline);
		process.failOnSignal = "SIGTERM";
		process.failOnRemovalSignal = "SIGINT";

		expect(() =>
			installGracefulShutdown({
				target: { close: vi.fn().mockResolvedValue(undefined) },
				process,
			}),
		).toThrow("failed to install SIGTERM");
		expect(process.listenerCount("SIGINT")).toBe(2);
	});
});
