import { Cause, Duration, Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { interruptOnAbortSignal } from "./internal.ts";

describe("interruptOnAbortSignal", () => {
	it("interrupts an in-flight effect and removes its listener", async () => {
		const controller = new AbortController();
		const addEventListener = vi.spyOn(controller.signal, "addEventListener");
		const removeEventListener = vi.spyOn(
			controller.signal,
			"removeEventListener",
		);
		const pending = Effect.runPromiseExit(
			Effect.raceFirst(
				Effect.sleep(Duration.millis(60_000)),
				interruptOnAbortSignal(controller.signal),
			),
		);

		await vi.waitFor(() =>
			expect(addEventListener).toHaveBeenCalledWith(
				"abort",
				expect.any(Function),
				{ once: true },
			),
		);
		const reason = new DOMException("caller canceled", "AbortError");
		controller.abort(reason);

		const exit = await pending;
		expect(exit._tag).toBe("Failure");
		if (exit._tag !== "Failure") return;
		expect(Cause.hasInterrupts(exit.cause)).toBe(true);
		await vi.waitFor(() =>
			expect(removeEventListener).toHaveBeenCalledWith(
				"abort",
				addEventListener.mock.calls[0]?.[1],
			),
		);
	});

	it("interrupts immediately when the signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort(new DOMException("already canceled", "AbortError"));
		const addEventListener = vi.spyOn(controller.signal, "addEventListener");

		const exit = await Effect.runPromiseExit(
			interruptOnAbortSignal(controller.signal),
		);

		expect(exit._tag).toBe("Failure");
		if (exit._tag !== "Failure") return;
		expect(Cause.hasInterrupts(exit.cause)).toBe(true);
		expect(addEventListener).not.toHaveBeenCalled();
	});

	it("cleans up when the competing effect wins", async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const addEventListener = vi.spyOn(controller.signal, "addEventListener");
		const removeEventListener = vi.spyOn(
			controller.signal,
			"removeEventListener",
		);

		try {
			const pending = Effect.runPromise(
				Effect.raceFirst(
					Effect.sleep(Duration.millis(10)).pipe(Effect.as("success")),
					interruptOnAbortSignal(controller.signal),
				),
			);
			await vi.waitFor(() => expect(addEventListener).toHaveBeenCalled());
			await vi.advanceTimersByTimeAsync(10);
			await expect(pending).resolves.toBe("success");
			await vi.waitFor(() =>
				expect(removeEventListener).toHaveBeenCalledWith(
					"abort",
					addEventListener.mock.calls[0]?.[1],
				),
			);
		} finally {
			vi.useRealTimers();
		}
	});
});
