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
	createHevyMcpServerEffect,
	HevyMcpServerConstructionError,
	type CreateHevyMcpServerOptions,
	type HevyClientFactoryContext,
} from "./server.js";
export { preloadHevyToolSchemas } from "./tools/register.js";
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
export {
	createSafeErrorDiagnostic,
	SAFE_ERROR_CATEGORIES,
	SAFE_ERROR_CODES,
	SAFE_HTTP_METHODS,
	SAFE_STACK_SOURCES,
} from "./utils/error-policy.js";
export {
	SAFE_USER_HASH_PATTERN,
	TELEMETRY_ARGUMENT_KEYS,
	USER_HASH_CONTEXT,
	USER_HASH_LENGTH,
} from "./utils/telemetry-contract.js";
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
export {
	ApiError,
	ClientNotInitializedError,
	NetworkError,
	NotFoundError,
	OperationUnavailableError,
	RateLimitError,
	ToolInputValidationError,
	ValidationError,
} from "./effect-errors.js";
export type { CoreToolError } from "./effect-errors.js";
export type { ToolEffectHandler } from "./tools/tool-runtime.js";
export {
	ExerciseTemplateCatalogService,
	HevyClientService,
	HevyOperationsService,
	ToolExecutionContextService,
	ToolObserverService,
} from "./effect-services.js";
export {
	createCoreServiceLayer,
	createToolObserverLayer,
	type CoreServiceLayerOptions,
	type CoreServiceIdentifiers,
	type CoreServiceLayer,
} from "./effect-layer.js";
