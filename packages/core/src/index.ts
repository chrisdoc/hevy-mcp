export {
	CONTRACT_MATRIX_PROTOCOL_VERSION,
	getWorkoutsCapabilityDescriptor,
	toolCapabilityCatalog,
	type ToolCapabilityCatalog,
	type ToolCapabilityDescriptor,
} from "./tools/capabilities.js";

export {
	HEVY_CLIENT_OPTION_INDEXES,
	bindClientExecution,
	createExecutionProjection,
	mergeAbortSignals,
	type ExecutionProjectionSource,
	type StructuredExecutionError,
	type StructuredExecutionProjection,
	type ToolExecutionContext,
} from "./execution.js";

export {
	createHevyMcpServer,
	type CreateHevyMcpServerOptions,
	type HevyClientFactoryContext,
} from "./server.js";
export {
	memoizeObservationScope,
	type ToolCompletionObservation,
	type ToolInvocationObservation,
	type SafeToolCompletion,
	type SafeToolInvocation,
	type ToolObservationScope,
	type ToolObserver,
	type ToolResultObservation,
} from "./observation.js";
export {
	type AsyncCacheOptions,
	type CacheGetOptions,
	type CacheObservation,
	type CacheObservationMetadata,
	type CacheObservationScope,
	type CacheObservationState,
	type CacheObserver,
} from "./utils/cache.js";
export { createSafeErrorDiagnostic } from "./utils/safe-error-diagnostic.js";
export {
	createMcpToolFailureEvent,
	createExecutionErrorProjection,
	type McpToolFailureEvent,
} from "./utils/error-handler.js";
export { ErrorType } from "./utils/error-policy.js";
export {
	bucketCount,
	type ResultCountBucket,
	type ToolResultTelemetry,
	type ToolResultTelemetry as ToolResultSummary,
} from "./utils/result-telemetry.js";
export {
	MCP_SPAN_CATEGORIES,
	type McpSpanCategory,
} from "./utils/tool-taxonomy.js";
