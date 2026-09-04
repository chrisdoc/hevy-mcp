import { Duration, Effect } from "effect";

export type ShutdownSignal = "SIGINT" | "SIGTERM";

interface CloseTarget {
	close(): Promise<void>;
}

interface ProcessLike {
	exitCode?: number | string | null;
	exit(code?: number | string | null): never;
	on(signal: ShutdownSignal, listener: () => void): unknown;
	removeListener(signal: ShutdownSignal, listener: () => void): unknown;
}

interface FlushableStdout {
	write(chunk: string, callback: (error?: Error | null) => void): boolean;
}

interface GracefulShutdownOptions {
	target: CloseTarget;
	process?: ProcessLike;
	logError?: (message: string) => void;
	flush?: () => Promise<void>;
	forcedExitTimeoutMs?: number;
	onComplete?: (succeeded: boolean) => void | Promise<void>;
	cancel?: AbortController;
}

export interface GracefulShutdownController {
	cleanup(): void;
	getShutdownPromise(): Promise<void> | undefined;
}

const shutdownSignals: ShutdownSignal[] = ["SIGINT", "SIGTERM"];

// Long enough for normal stdio flushing, but bounded so unrelated handles or a
// stalled close cannot keep a signal-terminated process alive indefinitely.
export const FORCED_EXIT_TIMEOUT_MS = 5_000;

export function flushStdout(
	stdout: FlushableStdout = process.stdout,
): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			stdout.write("", (error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		} catch (error) {
			reject(error);
		}
	});
}

export function installGracefulShutdown({
	target,
	process: processLike = process,
	logError = console.error,
	flush = flushStdout,
	forcedExitTimeoutMs = FORCED_EXIT_TIMEOUT_MS,
	cancel,
	onComplete,
}: GracefulShutdownOptions): GracefulShutdownController {
	let listenersInstalled = true;
	let shutdownSettled = false;
	let shutdownPromise: Promise<void> | undefined;
	let completionReported = false;

	const reportCompletion = (succeeded: boolean): Promise<void> | undefined => {
		if (completionReported) return undefined;
		completionReported = true;
		try {
			const completion = onComplete?.(succeeded);
			return completion
				? Promise.resolve(completion).catch(() => {
						logError("Graceful shutdown completion observer failed");
					})
				: undefined;
		} catch {
			logError("Graceful shutdown completion observer failed");
			return undefined;
		}
	};

	const cleanup = () => {
		if (!listenersInstalled || (shutdownPromise && !shutdownSettled)) {
			return;
		}

		listenersInstalled = false;
		for (const signal of shutdownSignals) {
			const listener = signalListeners.get(signal);
			if (listener) {
				processLike.removeListener(signal, listener);
			}
		}
	};

	const handleSignal = (signal: ShutdownSignal) => {
		if (shutdownPromise) {
			return;
		}

		if (processLike.exitCode == null) {
			processLike.exitCode = 0;
		}
		cancel?.abort(
			new DOMException(`Shutdown requested by ${signal}`, "AbortError"),
		);

		shutdownPromise = (async () => {
			logError(`Shutting down gracefully after ${signal}`);
			const shutdown = Effect.tryPromise({
				try: async () => {
					let shutdownError: unknown;
					try {
						await target.close();
					} catch (error) {
						shutdownError = error;
					}
					try {
						await flush();
					} catch (error) {
						shutdownError ??= error;
					}
					return { succeeded: shutdownError === undefined, shutdownError };
				},
				catch: (error) => ({ succeeded: false, shutdownError: error }),
			});
			const timed = Effect.race(
				shutdown,
				Effect.sleep(Duration.millis(forcedExitTimeoutMs)).pipe(
					Effect.as({ succeeded: false, timedOut: true as const }),
				),
			);
			const result = await Effect.runPromise(timed);
			if ("timedOut" in result) {
				await reportCompletion(false);
				processLike.exit(1);
				return;
			}

			if (!result.succeeded) {
				const message =
					result.shutdownError instanceof Error
						? result.shutdownError.message
						: "Unknown shutdown error";
				logError(`Graceful shutdown failed: ${message}`);
				processLike.exitCode = 1;
			}
			try {
				await reportCompletion(result.succeeded);
			} finally {
				shutdownSettled = true;
				cleanup();
			}
		})();
	};

	const signalListeners = new Map<ShutdownSignal, () => void>(
		shutdownSignals.map((signal) => [signal, () => handleSignal(signal)]),
	);

	for (const signal of shutdownSignals) {
		const listener = signalListeners.get(signal);
		if (listener) {
			processLike.on(signal, listener);
		}
	}

	return {
		cleanup,
		getShutdownPromise: () => shutdownPromise,
	};
}
