import { describe, expect, it, vi } from "vitest";
import {
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

	listenerCount(signal: ShutdownSignal) {
		return this.listeners.get(signal)?.size ?? 0;
	}

	emit(signal: ShutdownSignal) {
		for (const listener of this.listeners.get(signal) ?? []) listener();
	}
}

describe("package-local graceful shutdown", () => {
	it("closes, flushes, and removes signal listeners in order", async () => {
		const process = new FakeProcess();
		const events: string[] = [];
		const controller = installGracefulShutdown({
			target: {
				close: vi.fn(async () => {
					events.push("close");
				}),
			},
			process,
			logError: (message) => events.push(message),
			flush: vi.fn(async () => {
				events.push("flush");
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
});
