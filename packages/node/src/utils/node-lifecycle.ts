import { SpanStatusCode, type Span } from "@opentelemetry/api";
import {
	serviceName,
	serviceVersion,
	tracer,
	captureFailure,
	flushTelemetry,
	installProcessExceptionTracking,
} from "./telemetry.js";
import { serverStartups } from "./metrics.js";
import { installGracefulShutdown } from "./graceful-shutdown.js";
import { scheduleUpdateCheck } from "./version-check.js";
import { MissingHevyApiKeyError } from "./config.js";
import type { FailureContext } from "./failure-reporter.js";
export const INVALID_API_KEY_MESSAGE =
	"HEVY_API_KEY is invalid or expired. Please check your API key in the Hevy app under Settings > API Key.";

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
	target: { close(): Promise<void> };
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

/** Owns process-wide Node lifecycle concerns while leaving transport state local. */
export async function runNodeLifecycle({
	transport,
	start,
	onFailure,
}: RunNodeLifecycleOptions): Promise<void> {
	const cleanupProcessExceptionTracking = installProcessExceptionTracking();
	const lifecycleController = new AbortController();
	const state = createOutcomeState(transport);
	const context: NodeLifecycleContext = {
		signal: lifecycleController.signal,
		markConnectAttempted: () => state.markConnectAttempted(),
		markConnectSucceeded: () => state.markConnectSucceeded(),
		markListening: () => state.markListening(),
	};

	serverStartups.add(1, { version: serviceVersion });
	await tracer.startActiveSpan(
		"mcp.server.run",
		{
			attributes: {
				"mcp.span.category": "startup",
				"mcp.transport": transport,
			},
		},
		async (span) => {
			try {
				const result = await start(context);
				scheduleUpdateCheck({
					packageName: serviceName,
					currentVersion: serviceVersion,
				});
				installGracefulShutdown({
					target: result.target,
					cancel: lifecycleController,
					onComplete: async (succeeded) => {
						try {
							await result.onShutdown?.(succeeded);
						} finally {
							cleanupProcessExceptionTracking();
							await flushTelemetry();
						}
					},
				});
				span.setStatus({ code: SpanStatusCode.OK });
			} catch (error) {
				const outcome = state.getOutcome();
				const reason = classifyFailure(outcome);
				// A failed stdio connect already has its own connect span. Preserve
				// that taxonomy and only record the common run failure otherwise.
				if (!(outcome.transport === "stdio" && reason === "connect_failure")) {
					recordLifecycleFailure(
						span,
						error instanceof Error ? error : String(error),
						"run",
						reason,
					);
				}
				onFailure?.(reason, outcome);
				span.setStatus({ code: SpanStatusCode.ERROR });
				cleanupProcessExceptionTracking();
				throw error;
			} finally {
				span.end();
			}
		},
	);
}

export type { LifecycleFailurePhase, LifecycleTerminationReason };
