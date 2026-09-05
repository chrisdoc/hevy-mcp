import { SpanStatusCode, type Span } from "@opentelemetry/api";
import { Data, Effect, Exit, Layer, Scope } from "effect";
import {
	serviceName,
	serviceVersion,
	tracer,
	captureFailure,
	flushTelemetry,
	installProcessExceptionTracking,
	telemetryLayer,
} from "./telemetry.js";
import { serverStartups } from "./metrics.js";
import { installGracefulShutdown } from "./graceful-shutdown.js";
import { scheduleUpdateCheck } from "./version-check.js";
import { MissingHevyApiKeyError } from "./config.js";
import type { FailureContext } from "./failure-reporter.js";
import {
	INVALID_API_KEY_MESSAGE,
	InvalidHevyApiKeyError,
} from "./startup-errors.js";
export { INVALID_API_KEY_MESSAGE } from "./startup-errors.js";

type LifecycleFailurePhase =
	| "config"
	| "api_key_validation"
	| "build"
	| "connect"
	| "run";

type LifecycleTerminationReason =
	| "connect_failure"
	| "runtime_failure"
	| "startup_failure";

class LifecycleFailure extends Data.TaggedError("LifecycleFailure")<{
	readonly cause: Error | string;
	readonly phase: LifecycleFailurePhase;
}> {}

const LIFECYCLE_FAILURE_TAXONOMY = {
	config: {
		errorType: "MCP_SERVER_CONFIG_ERROR",
		errorCategory: "McpServerConfigFailure",
	},
	api_key_validation: {
		errorType: "MCP_API_KEY_VALIDATION_ERROR",
		errorCategory: "McpApiKeyValidationFailure",
	},
	build: {
		errorType: "MCP_SERVER_BUILD_ERROR",
		errorCategory: "McpServerBuildFailure",
	},
	connect: {
		errorType: "MCP_TRANSPORT_CONNECT_ERROR",
		errorCategory: "McpTransportConnectFailure",
	},
	run: {
		errorType: "MCP_SERVER_RUN_ERROR",
		errorCategory: "McpServerRunFailure",
	},
} satisfies Record<
	LifecycleFailurePhase,
	{ errorType: string; errorCategory: string }
>;

function isExpectedLifecycleFailure(error: Error | string): boolean {
	return (
		error instanceof MissingHevyApiKeyError ||
		error instanceof InvalidHevyApiKeyError ||
		(error instanceof Error && error.message === INVALID_API_KEY_MESSAGE)
	);
}

function createLifecycleFailureAttributes(
	phase: LifecycleFailurePhase,
	terminationReason: LifecycleTerminationReason,
) {
	const taxonomy = LIFECYCLE_FAILURE_TAXONOMY[phase];
	return {
		"mcp.failure.phase": phase,
		"mcp.termination.reason": terminationReason,
		"error.type": taxonomy.errorType,
		"error.category": taxonomy.errorCategory,
	};
}

export function recordLifecycleFailure(
	span: Span,
	error: Error | string,
	phase: LifecycleFailurePhase,
	terminationReason: LifecycleTerminationReason,
): void {
	const attributes = createLifecycleFailureAttributes(phase, terminationReason);
	span.addEvent("mcp.lifecycle.failure", attributes);
	const failure = {
		kind: "lifecycle",
		attributes,
		span,
	} satisfies FailureContext;
	captureFailure(
		error,
		isExpectedLifecycleFailure(error)
			? { ...failure, expected: true }
			: failure,
	);
}

export type NodeLifecycleTransport = "stdio" | "http";

export interface NodeLifecycleContext {
	readonly signal: AbortSignal;
	/** Mark the beginning of a stdio transport connection attempt. */
	markConnectAttempted(): void;
	/** Mark a successful stdio transport connection. */
	markConnectSucceeded(): void;
	/** Mark the HTTP listener as successfully started. */
	markListening(): void;
	/** Register a partially acquired target so startup failure can close it. */
	adoptTarget(target: NodeLifecycleTarget): NodeLifecycleTarget;
}

export interface NodeLifecycleTarget {
	close(): Promise<void>;
}

export type NodeLifecycleOutcome =
	| {
			transport: "stdio";
			connectAttempted: boolean;
			connectSucceeded: boolean;
	  }
	| {
			transport: "http";
			listening: boolean;
	  };

export interface NodeLifecycleStartupResult {
	target: NodeLifecycleTarget;
	onShutdown?: (succeeded: boolean) => void | Promise<void>;
}

export interface RunNodeLifecycleOptions {
	transport: NodeLifecycleTransport;
	readonly start: (
		context: NodeLifecycleContext,
	) => Promise<NodeLifecycleStartupResult>;
	readonly onFailure?: (
		reason: LifecycleTerminationReason,
		outcome: NodeLifecycleOutcome,
	) => void;
}

export interface NodeLifecycleHandle {
	close(): Promise<void>;
}

function createOutcomeState(transport: NodeLifecycleTransport) {
	let connectAttempted = false;
	let connectSucceeded = false;
	let listening = false;
	return {
		markConnectAttempted: () => {
			connectAttempted = true;
		},
		markConnectSucceeded: () => {
			connectSucceeded = true;
		},
		markListening: () => {
			listening = true;
		},
		getOutcome: (): NodeLifecycleOutcome =>
			transport === "stdio"
				? { transport, connectAttempted, connectSucceeded }
				: { transport, listening },
	};
}

function classifyFailure(
	outcome: NodeLifecycleOutcome,
): LifecycleTerminationReason {
	if (outcome.transport === "stdio") {
		if (outcome.connectAttempted && !outcome.connectSucceeded) {
			return "connect_failure";
		}
		return outcome.connectSucceeded ? "runtime_failure" : "startup_failure";
	}
	return outcome.listening ? "runtime_failure" : "startup_failure";
}

function asError(error: Error | string): Error {
	return error instanceof Error ? error : new Error(String(error));
}

/** Owns process-wide Node lifecycle concerns while leaving transport state local. */
export async function runNodeLifecycle({
	transport,
	start,
	onFailure,
}: RunNodeLifecycleOptions): Promise<NodeLifecycleHandle> {
	const processScope = await Effect.runPromise(Scope.make());
	if (telemetryLayer) {
		await Effect.runPromise(
			Layer.buildWithScope(telemetryLayer, processScope).pipe(
				Effect.catch(() => Effect.void),
			),
		);
	}
	const lifecycleController = new AbortController();
	const state = createOutcomeState(transport);
	let processScopeClosePromise: Promise<void> | undefined;
	const closeProcessScope = (): Promise<void> => {
		if (processScopeClosePromise) return processScopeClosePromise;
		processScopeClosePromise = Effect.runPromise(
			Scope.close(processScope, Exit.succeed(undefined)),
		)
			.catch(() => undefined)
			.then(async () => {
				// Keep compatibility with test doubles and alternate telemetry
				// implementations that do not provide a Layer.
				if (!telemetryLayer) await flushTelemetry().catch(() => undefined);
			});
		return processScopeClosePromise;
	};

	let resolveReady: (handle: NodeLifecycleHandle) => void = () => undefined;
	let rejectReady: (error?: Error | string | LifecycleFailure) => void = () =>
		undefined;
	const ready = new Promise<NodeLifecycleHandle>((resolve, reject) => {
		resolveReady = resolve;
		rejectReady = reject;
	});
	let resolveCompletion: () => void = () => undefined;
	const completion = new Promise<void>((resolve) => {
		resolveCompletion = resolve;
	});
	let completionReported = false;
	const startupCleanups = new Set<() => Promise<void>>();
	const adoptedTargets = new WeakMap<
		NodeLifecycleTarget,
		NodeLifecycleTarget
	>();
	const adoptTarget = (target: NodeLifecycleTarget): NodeLifecycleTarget => {
		const existing = adoptedTargets.get(target);
		if (existing) return existing;
		let closePromise: Promise<void> | undefined;
		const close = (): Promise<void> => {
			if (closePromise) return closePromise;
			closePromise = Promise.resolve()
				.then(() => target.close())
				.catch((error) => {
					throw error;
				});
			return closePromise;
		};
		startupCleanups.add(close);
		const adopted = { close };
		adoptedTargets.set(target, adopted);
		return adopted;
	};
	const context: NodeLifecycleContext = {
		signal: lifecycleController.signal,
		markConnectAttempted: () => state.markConnectAttempted(),
		markConnectSucceeded: () => state.markConnectSucceeded(),
		markListening: () => state.markListening(),
		adoptTarget,
	};

	serverStartups.add(1, { version: serviceVersion });
	let span: Span | undefined;
	const ownerProgram = Effect.gen(function* () {
		yield* Effect.acquireRelease(
			Effect.try({
				try: installProcessExceptionTracking,
				catch: (cause) =>
					new LifecycleFailure({
						cause: cause instanceof Error ? cause : String(cause),
						phase: "run",
					}),
			}),
			(cleanup) => Effect.sync(cleanup),
		);
		yield* Effect.acquireRelease(Effect.succeed(undefined), () =>
			Effect.promise(async () => {
				for (const cleanup of Array.from(startupCleanups).toReversed()) {
					await cleanup().catch(() => undefined);
				}
			}),
		);

		const result = yield* Effect.tryPromise({
			try: () => start(context),
			catch: (cause) =>
				new LifecycleFailure({
					cause: cause instanceof Error ? cause : String(cause),
					phase: "run",
				}),
		});
		const target = result.target;
		const ownedTarget = adoptTarget(target);
		const cancelUpdateCheck = yield* Effect.try({
			try: () =>
				scheduleUpdateCheck({
					packageName: serviceName,
					currentVersion: serviceVersion,
				}),
			catch: (cause) =>
				new LifecycleFailure({
					cause: cause instanceof Error ? cause : String(cause),
					phase: "run",
				}),
		});
		yield* Effect.acquireRelease(Effect.succeed(cancelUpdateCheck), (cancel) =>
			Effect.sync(() => cancel?.()),
		);

		const shutdown = yield* Effect.try({
			try: () =>
				installGracefulShutdown({
					target,
					closeTarget: () => ownedTarget.close(),
					cancel: lifecycleController,
					onComplete: async (succeeded) => {
						if (completionReported) return;
						completionReported = true;
						try {
							await result.onShutdown?.(succeeded);
						} finally {
							resolveCompletion();
							await closeProcessScope();
						}
					},
				}),
			catch: (cause) =>
				new LifecycleFailure({
					cause: cause instanceof Error ? cause : String(cause),
					phase: "run",
				}),
		});
		if (shutdown) {
			yield* Effect.acquireRelease(Effect.succeed(shutdown), (controller) =>
				Effect.sync(() => controller.cleanup()),
			);
		}

		resolveReady({
			close: shutdown ? () => shutdown.close() : () => target.close(),
		});
		span?.setStatus({ code: SpanStatusCode.OK });
		if (!shutdown) resolveCompletion();
		yield* Effect.promise(() => completion);
	});

	const ownerFiber = await Effect.runPromise(
		Effect.forkIn(
			ownerProgram.pipe(
				Effect.tapError((error) =>
					Effect.sync(() => {
						rejectReady(error);
					}),
				),
			),
			processScope,
			{ startImmediately: true },
		).pipe(Effect.provideService(Scope.Scope, processScope)),
	);
	const ownerCompletion = new Promise<void>((resolve) => {
		ownerFiber.addObserver(() => {
			void closeProcessScope().finally(resolve);
		});
	});

	await tracer.startActiveSpan(
		"mcp.server.run",
		{
			attributes: {
				"mcp.span.category": "startup",
				"mcp.transport": transport,
			},
		},
		async (startupSpan) => {
			span = startupSpan;
			try {
				await ready;
			} catch (error) {
				const outcome = state.getOutcome();
				const reason = classifyFailure(outcome);
				const projectedError =
					error instanceof LifecycleFailure
						? asError(error.cause)
						: asError(error instanceof Error ? error : String(error));
				if (!(outcome.transport === "stdio" && reason === "connect_failure")) {
					recordLifecycleFailure(startupSpan, projectedError, "run", reason);
				}
				onFailure?.(reason, outcome);
				startupSpan.setStatus({ code: SpanStatusCode.ERROR });
				await ownerCompletion;
				throw projectedError;
			} finally {
				startupSpan.end();
			}
		},
	);

	return await ready;
}

export type { LifecycleFailurePhase, LifecycleTerminationReason };
