import type { McpClientLogger } from "../utils/mcp-client-logger.js";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import { createOperations, type HevyOperations } from "@hevy-mcp/operations";
import {
	HEVY_CLIENT_NOT_INITIALIZED_ERROR,
	requireClient,
} from "../utils/tool-helpers.js";
import { withErrorHandling } from "../utils/error-handler.js";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import type { McpToolResponse } from "../utils/response-contracts.js";
import type { ToolTelemetryMetadata } from "../utils/tool-taxonomy.js";
import {
	memoizeObservationScope,
	type SafeToolArgumentKey,
	type ToolObserver,
} from "../observation.js";
import { bucketCount, getResultTelemetry } from "../utils/result-telemetry.js";
import { resolveErrorPolicy } from "../utils/error-policy.js";
import {
	bindClientExecution,
	mergeAbortSignals,
	type ToolExecutionContext,
} from "../execution.js";
import { DEFAULT_API_TIMEOUT_MS } from "@hevy-mcp/hevy-client";

const STRUCTURAL_ARGUMENT_KEYS: Readonly<Record<string, true>> = {
	page: true,
	page_size: true,
	since: true,
	workout_id: true,
	routine_id: true,
	folder_id: true,
	exercise_template_id: true,
	date: true,
	start_date: true,
	end_date: true,
	updated_since: true,
	include_custom: true,
	limit: true,
	offset: true,
	refresh: true,
	query: true,
	primary_muscle_group: true,
};

const PRESENCE_ARGUMENT_KEYS: Readonly<Record<string, true>> = {
	since: true,
	workout_id: true,
	routine_id: true,
	folder_id: true,
	exercise_template_id: true,
	date: true,
	start_date: true,
	end_date: true,
	updated_since: true,
	query: true,
	primary_muscle_group: true,
};

const NUMERIC_ARGUMENT_KEYS: Readonly<Record<string, true>> = {
	page: true,
	page_size: true,
	limit: true,
	offset: true,
};

const BOOLEAN_ARGUMENT_KEYS: Readonly<Record<string, true>> = {
	include_custom: true,
	refresh: true,
};

const structuralArgumentKeys = Object.keys(
	STRUCTURAL_ARGUMENT_KEYS,
) as SafeToolArgumentKey[];

function createSafeInvocation(
	name: string,
	args: object,
	taxonomy: ToolTelemetryMetadata | undefined,
) {
	const argumentValues = new Map<string, unknown>(Object.entries(args));
	const argumentKeys = structuralArgumentKeys.filter((key) => key in args);
	const argumentPresence: Record<string, true> = {};
	const numericArgumentBuckets: Record<
		string,
		ReturnType<typeof bucketCount>
	> = {};
	const booleanArguments: Record<string, boolean> = {};

	for (const key of argumentKeys) {
		const value = argumentValues.get(key);
		if (
			key in PRESENCE_ARGUMENT_KEYS &&
			value !== null &&
			value !== undefined
		) {
			argumentPresence[key] = true;
		}
		if (key in NUMERIC_ARGUMENT_KEYS && typeof value === "number") {
			numericArgumentBuckets[key] = bucketCount(value);
		}
		if (key in BOOLEAN_ARGUMENT_KEYS && typeof value === "boolean") {
			booleanArguments[key] = value;
		}
	}

	return {
		name,
		taxonomy,
		argumentKeys,
		argumentPresence,
		numericArgumentBuckets,
		booleanArguments,
		argumentKeyCountBucket: bucketCount(Object.keys(args).length),
	};
}

export type ToolHandler<TParams extends object = object> = (
	args: TParams,
	context?: ToolExecutionContext,
) => Promise<McpToolResponse>;

export type ToolHandlerFactory = <TParams extends object>(
	fn: ToolHandler<TParams>,
	context: string,
	metadata?: ToolTelemetryMetadata,
) => ToolHandler;
export interface ToolRuntime {
	readonly client: HevyClient | null;
	readonly catalog: ExerciseTemplateCatalog;
	readonly logger?: McpClientLogger;
	readonly execution?: ToolExecutionContext;
	readonly executionTimeoutMs: number;
	readonly executionDeadline?: number;
	readonly lifecycleSignal?: AbortSignal;
	readonly operations: HevyOperations | null;
	readonly createHandler: ToolHandlerFactory;
	getClient(): HevyClient;
	getOperations(): HevyOperations;
	forExecution(context?: ToolExecutionContext): ToolRuntime;
}

export interface CreateToolRuntimeOptions {
	client: HevyClient | null;
	/** Unbound client retained across nested execution scopes. */
	baseClient?: HevyClient | null;
	operations?: HevyOperations;
	catalog: ExerciseTemplateCatalog;
	logger?: McpClientLogger;
	createHandler?: ToolHandlerFactory;
	observer?: ToolObserver;
	execution?: ToolExecutionContext;
	executionTimeoutMs?: number;
	executionDeadline?: number;
	lifecycleSignal?: AbortSignal;
}

export const defaultHandlerFactory: ToolHandlerFactory = <
	TParams extends object,
>(
	fn: ToolHandler<TParams>,
	context: string,
) => withErrorHandling(fn, context);

export function createToolRuntime({
	client,
	baseClient,
	operations,
	catalog,
	logger,
	createHandler = defaultHandlerFactory,
	observer,
	execution,
	executionTimeoutMs = DEFAULT_API_TIMEOUT_MS,
	executionDeadline,
	lifecycleSignal,
}: CreateToolRuntimeOptions): ToolRuntime {
	const rawClient = baseClient ?? client;
	const resolvedOperations =
		operations ?? (rawClient ? createOperations(rawClient) : null);
	const effectiveExecutionDeadline = executionDeadline ?? execution?.deadline;
	const createObservedHandler: ToolHandlerFactory = <TParams extends object>(
		fn: ToolHandler<TParams>,
		context: string,
		metadata?: ToolTelemetryMetadata,
	) =>
		createHandler<TParams>(
			async (args: TParams, requestContext?: ToolExecutionContext) => {
				let scope;
				try {
					scope = memoizeObservationScope(
						observer?.start(createSafeInvocation(context, args, metadata)),
					);
				} catch {
					scope = undefined;
				}
				const startedAt = Date.now();
				let handlerPromise: Promise<McpToolResponse> | undefined;
				const invokeHandler = () => {
					handlerPromise ??= Promise.resolve().then(() =>
						fn(args, requestContext),
					);
					return handlerPromise;
				};
				try {
					let runPromise: Promise<McpToolResponse>;
					if (scope) {
						try {
							runPromise = scope.run(invokeHandler);
						} catch {
							runPromise = invokeHandler();
						}
					} else {
						runPromise = invokeHandler();
					}
					const result = await runPromise.catch(invokeHandler);
					void scope?.finish({
						outcome: result.isError ? "returned_error" : "success",
						durationMs: Date.now() - startedAt,
						...(result.errorOutcome
							? { errorOutcome: result.errorOutcome }
							: {}),
						result: {
							isError: Boolean(result.isError),
							hasStructuredContent: result.structuredContent !== undefined,
							contentCountBucket: bucketCount(result.content.length),
							summary: getResultTelemetry(result),
						},
					});
					return result;
				} catch (error) {
					const policy = resolveErrorPolicy(error, "");
					void scope?.finish({
						outcome: "thrown_error",
						durationMs: Date.now() - startedAt,
						errorType: policy.type,
						error: policy.diagnostic,
					});
					throw error;
				}
			},
			context,
			metadata,
		);
	const observedHandlerFactory = observer
		? createObservedHandler
		: createHandler;
	const runtime: ToolRuntime = {
		client,
		catalog: execution
			? {
					get: (options) => catalog.get({ ...options, execution }),
					reset: () => catalog.reset(),
				}
			: catalog,
		logger,
		execution,
		executionTimeoutMs,
		executionDeadline: effectiveExecutionDeadline,
		lifecycleSignal,
		operations: resolvedOperations,
		createHandler: observedHandlerFactory,
		getClient: () => requireClient(client),
		getOperations: () =>
			resolvedOperations ?? createOperations(requireClient(client)),
		forExecution: (nextExecution) =>
			createToolRuntime({
				client: rawClient,
				baseClient: rawClient,
				operations: resolvedOperations ?? undefined,
				catalog,
				logger,
				createHandler,
				observer,
				execution: {
					...(nextExecution ?? {}),
					signal: mergeAbortSignals(lifecycleSignal, nextExecution?.signal),
					deadline:
						nextExecution?.deadline ??
						effectiveExecutionDeadline ??
						Date.now() + executionTimeoutMs,
				},
				executionTimeoutMs,
				executionDeadline:
					nextExecution?.deadline ?? effectiveExecutionDeadline,
				lifecycleSignal,
			}),
	};
	if (execution && client) {
		Object.assign(runtime, {
			client: bindClientExecution(requireClient(rawClient), execution),
			getClient: () => bindClientExecution(requireClient(rawClient), execution),
		});
	}
	return runtime;
}

export { HEVY_CLIENT_NOT_INITIALIZED_ERROR };
