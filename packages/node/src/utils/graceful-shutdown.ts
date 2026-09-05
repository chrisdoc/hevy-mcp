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
	closeTarget?: () => Promise<void>;
	process?: ProcessLike;
	logError?: (message: string) => void;
	flush?: () => Promise<void>;
	forcedExitTimeoutMs?: number;
	onComplete?: (succeeded: boolean) => void | Promise<void>;
	cancel?: AbortController;
}

export interface GracefulShutdownController {
	cleanup(): void;
	close(): Promise<void>;
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
	closeTarget,
	forcedExitTimeoutMs = FORCED_EXIT_TIMEOUT_MS,
	cancel,
	onComplete,
}: GracefulShutdownOptions): GracefulShutdownController {
	let shutdownSettled = false;
	let shutdownPromise: Promise<void> | undefined;
	let completionReported = false;
	let listenersCleaned = false;
	const installedListeners: Array<{
		signal: ShutdownSignal;
		listener: () => void;
	}> = [];

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
		if (listenersCleaned || (shutdownPromise && !shutdownSettled)) {
			return;
		}

		listenersCleaned = true;
		for (const { signal, listener } of installedListeners.toReversed()) {
			try {
				processLike.removeListener(signal, listener);
			} catch {
				// Cleanup must not replace the shutdown or registration error.
			}
		}
	};

	const runShutdown = (
		signal: ShutdownSignal | "close",
		rejectOnFailure: boolean,
	): Promise<void> => {
		if (signal !== "close") {
			if (processLike.exitCode == null) {
				processLike.exitCode = 0;
			}
			cancel?.abort(
				new DOMException(`Shutdown requested by ${signal}`, "AbortError"),
			);
		} else {
			cancel?.abort(
				new DOMException("Shutdown requested by close", "AbortError"),
			);
		}

		if (signal !== "close") {
			logError(`Shutting down gracefully after ${signal}`);
		}

		const shutdown = Effect.tryPromise({
			try: async () => {
				let shutdownError: unknown;
				try {
					await (closeTarget ? closeTarget() : target.close());
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

		return Effect.runPromise(timed).then(async (result) => {
			if ("timedOut" in result) {
				await reportCompletion(false);
				if (signal !== "close") {
					processLike.exit(1);
					return;
				}
				shutdownSettled = true;
				cleanup();
				if (rejectOnFailure) {
					throw new Error("Graceful shutdown timed out.");
				}
				return;
			}

			if (!result.succeeded) {
				const message =
					result.shutdownError instanceof Error
						? result.shutdownError.message
						: "Unknown shutdown error";
				logError(`Graceful shutdown failed: ${message}`);
				if (signal !== "close") {
					processLike.exitCode = 1;
				}
			}
			try {
				await reportCompletion(result.succeeded);
			} finally {
				shutdownSettled = true;
				cleanup();
			}
			if (!result.succeeded && rejectOnFailure) {
				throw result.shutdownError instanceof Error
					? result.shutdownError
					: new Error("Graceful shutdown failed.");
			}
		});
	};

	const handleSignal = (signal: ShutdownSignal) => {
		if (shutdownPromise) {
			return;
		}

		shutdownPromise = runShutdown(signal, false).catch(() => undefined);
	};

	const signalListeners = new Map<ShutdownSignal, () => void>(
		shutdownSignals.map((signal) => [signal, () => handleSignal(signal)]),
	);

	try {
		for (const signal of shutdownSignals) {
			const listener = signalListeners.get(signal);
			if (listener) {
				processLike.on(signal, listener);
				installedListeners.push({ signal, listener });
			}
		}
	} catch (error) {
		cleanup();
		throw error;
	}

	return {
		cleanup,
		close: () => {
			if (shutdownPromise) return shutdownPromise;
			shutdownPromise = runShutdown("close", true);
			return shutdownPromise;
		},
		getShutdownPromise: () => shutdownPromise,
	};
}
