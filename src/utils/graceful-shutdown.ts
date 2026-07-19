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

interface ForcedExitTimer {
	unref(): void;
}

type ScheduleForcedExit = (
	callback: () => void,
	timeoutMs: number,
) => ForcedExitTimer;

interface GracefulShutdownOptions {
	target: CloseTarget;
	process?: ProcessLike;
	logError?: (message: string) => void;
	flush?: () => Promise<void>;
	forcedExitTimeoutMs?: number;
	onComplete?: (succeeded: boolean) => void;
	scheduleForcedExit?: ScheduleForcedExit;
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
	scheduleForcedExit = setTimeout,
	onComplete,
}: GracefulShutdownOptions): GracefulShutdownController {
	let listenersInstalled = true;
	let shutdownSettled = false;
	let shutdownPromise: Promise<void> | undefined;
	let completionReported = false;

	const reportCompletion = (succeeded: boolean) => {
		if (completionReported) return;
		completionReported = true;
		try {
			onComplete?.(succeeded);
		} catch {
			logError("Graceful shutdown completion observer failed");
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

		const forcedExitTimer = scheduleForcedExit(() => {
			reportCompletion(false);
			processLike.exit(processLike.exitCode ?? 0);
		}, forcedExitTimeoutMs);
		// This fallback must survive successful shutdown so it can terminate a
		// process held open by unrelated handles, without keeping the process alive
		// when the event loop drains normally.
		forcedExitTimer.unref();

		shutdownPromise = (async () => {
			logError(`Shutting down gracefully after ${signal}`);
			let shutdownFailed = false;
			let shutdownError: unknown;

			try {
				await target.close();
			} catch (error) {
				shutdownFailed = true;
				shutdownError = error;
			}

			try {
				await flush();
			} catch (error) {
				if (!shutdownFailed) {
					shutdownError = error;
				}
				shutdownFailed = true;
			}

			try {
				if (shutdownFailed) {
					const message =
						shutdownError instanceof Error
							? shutdownError.message
							: "Unknown shutdown error";
					logError(`Graceful shutdown failed: ${message}`);
					processLike.exitCode = 1;
					return;
				}
			} finally {
				shutdownSettled = true;
				reportCompletion(!shutdownFailed);
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
