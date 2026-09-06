import { Context, Effect, Layer, Option } from "effect";
import type { McpClientLogger } from "../utils/mcp-client-logger-types.js";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import { createOperations, type HevyOperations } from "@hevy-mcp/operations";
import type { CoreToolError } from "../effect-errors.js";
import {
	createCoreServiceLayer,
	createToolObserverLayer,
	createCoreServiceContext,
	overlayCoreServiceContext,
	type CoreServiceIdentifiers,
} from "../effect-layer.js";
import {
	ExerciseTemplateCatalogService,
	HevyClientService,
	HevyOperationsService,
	ToolObserverService,
} from "../effect-services.js";
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
	type ToolCompletionObservation,
} from "../observation.js";
import { bucketCount, getResultTelemetry } from "../utils/result-telemetry.js";
import { resolveErrorPolicy } from "../utils/error-policy.js";
import { logCoreError } from "../utils/core-logger.js";
import {
	bindClientExecution,
	mergeAbortSignals,
	runBoundedExecution,
	type ToolExecutionContext,
} from "../execution.js";
import { DEFAULT_API_TIMEOUT_MS } from "@hevy-mcp/hevy-client";
import { TELEMETRY_ARGUMENT_KEYS } from "../utils/telemetry-contract.js";
import { isBoolean, isFiniteNumber } from "../utils/type-predicates.js";

interface ArgumentKeySet {
	readonly [key: string]: true;
}

const toKeySet = (keys: readonly string[]): Readonly<ArgumentKeySet> =>
	Object.fromEntries(keys.map((key) => [key, true as const]));

const STRUCTURAL_ARGUMENT_KEYS: Readonly<ArgumentKeySet> = toKeySet(
	TELEMETRY_ARGUMENT_KEYS,
);

const PRESENCE_ARGUMENT_KEYS: Readonly<ArgumentKeySet> = {
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

const NUMERIC_ARGUMENT_KEYS: Readonly<ArgumentKeySet> = {
	page: true,
	page_size: true,
	limit: true,
	offset: true,
};

const BOOLEAN_ARGUMENT_KEYS: Readonly<ArgumentKeySet> = {
	include_custom: true,
	refresh: true,
};

const structuralArgumentKeys = Object.keys(
	STRUCTURAL_ARGUMENT_KEYS,
) as SafeToolArgumentKey[];

type ToolRuntimeServiceIdentifiers =
	| CoreServiceIdentifiers
	| ToolObserverService;
type ToolRuntimeServiceLayer = Layer.Layer<ToolRuntimeServiceIdentifiers>;
export type ToolRuntimeServiceContext =
	Context.Context<ToolRuntimeServiceIdentifiers>;

function createSafeInvocation<TArgs extends object>(
	name: string,
	args: TArgs,
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
		if (key in NUMERIC_ARGUMENT_KEYS && isFiniteNumber(value)) {
			numericArgumentBuckets[key] = bucketCount(value);
		}
		if (key in BOOLEAN_ARGUMENT_KEYS && isBoolean(value)) {
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

export type ToolEffectHandler<TParams extends object = object> = (
	args: TParams,
	context?: ToolExecutionContext,
) => Effect.Effect<McpToolResponse, CoreToolError, never>;

export type ToolHandlerFactory = <TParams extends object>(
	fn: ToolEffectHandler<TParams>,
	context: string,
	metadata?: ToolTelemetryMetadata,
) => ToolHandler;
export interface ToolRuntime {
	readonly client: HevyClient | null;
	readonly catalog: ExerciseTemplateCatalog;
	/** The request-local dependency graph used by Effect-backed tool code. */
	readonly layer?: ToolRuntimeServiceLayer;
	/** The context built from `layer`, kept request-local with the runtime. */
	readonly services?: ToolRuntimeServiceContext;
	readonly logger?: McpClientLogger;
	readonly execution?: ToolExecutionContext;
	readonly executionTimeoutMs: number;
	readonly executionDeadline?: number;
	readonly lifecycleSignal?: AbortSignal;
	readonly operations: HevyOperations | null;
	readonly createHandler: ToolHandlerFactory;
	service<I extends ToolRuntimeServiceIdentifiers, S>(
		service: Context.Key<I, S>,
	): S;
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
	/** A context acquired by the caller-owned server Scope. */
	services?: ToolRuntimeServiceContext;
	execution?: ToolExecutionContext;
	executionTimeoutMs?: number;
	executionDeadline?: number;
	lifecycleSignal?: AbortSignal;
}

function runToolEffect<TParams extends object>(
	fn: ToolEffectHandler<TParams>,
	args: TParams,
	requestContext: ToolExecutionContext | undefined,
	services: ToolRuntimeServiceContext | undefined,
	lifecycleSignal?: AbortSignal,
	executionTimeoutMs = DEFAULT_API_TIMEOUT_MS,
	executionDeadline?: number,
): Promise<McpToolResponse> {
	const program = Effect.suspend(() => fn(args, requestContext));
	const provided = services ? Effect.provide(program, services) : program;
	// Pass the MCP request signal to the Effect runtime as well as binding it
	// to the Hevy client. This interrupts the fiber while it is waiting on
	// non-fetch work (for example a retry delay or a cache lookup), and the
	// client bridge then aborts native fetch at its edge.
	return runBoundedExecution(provided, {
		signal: mergeAbortSignals(lifecycleSignal, requestContext?.signal),
		timeoutMs: executionTimeoutMs,
		deadline: requestContext?.deadline ?? executionDeadline,
	});
}

export const defaultHandlerFactory: ToolHandlerFactory = <
	TParams extends object,
>(
	fn: ToolEffectHandler<TParams>,
	context: string,
) =>
	withErrorHandling(
		(args: TParams, requestContext?: ToolExecutionContext) =>
			runToolEffect(fn, args, requestContext, undefined),
		context,
		undefined,
		undefined,
	) as ToolHandler;

export function createToolRuntime({
	client,
	baseClient,
	operations,
	catalog,
	logger,
	createHandler,
	observer,
	services: providedServices,
	execution,
	executionTimeoutMs = DEFAULT_API_TIMEOUT_MS,
	executionDeadline,
	lifecycleSignal,
}: CreateToolRuntimeOptions): ToolRuntime {
	const providedClient = providedServices
		? Context.getOption(providedServices, HevyClientService)
		: Option.none();
	const providedOperations = providedServices
		? Context.getOption(providedServices, HevyOperationsService)
		: Option.none();
	const providedCatalog = providedServices
		? Context.getOption(providedServices, ExerciseTemplateCatalogService)
		: Option.none();
	const providedObserver = providedServices
		? Context.getOption(providedServices, ToolObserverService)
		: Option.none();
	const effectiveObserver = observer ?? Option.getOrUndefined(providedObserver);
	const rawClient =
		baseClient ??
		(Option.isSome(providedClient) ? providedClient.value : client);
	const resolvedOperations = Option.isSome(providedOperations)
		? providedOperations.value
		: (operations ?? (rawClient ? createOperations(rawClient) : null));
	const effectiveExecutionDeadline = executionDeadline ?? execution?.deadline;
	const effectiveClient = Option.isSome(providedClient)
		? providedClient.value
		: execution && rawClient
			? bindClientExecution(requireClient(rawClient), execution)
			: client;
	const effectiveCatalog = execution
		? Option.isSome(providedCatalog)
			? providedCatalog.value
			: {
					effect: (options = {}) => catalog.effect({ ...options, execution }),
					get: (options = {}) => catalog.get({ ...options, execution }),
					reset: () => catalog.reset(),
				}
		: Option.isSome(providedCatalog)
			? providedCatalog.value
			: catalog;
	const coreLayer =
		effectiveClient && resolvedOperations
			? (createCoreServiceLayer({
					client: effectiveClient,
					catalog: effectiveCatalog,
					execution: execution ?? {},
					operations: resolvedOperations,
				}) as ToolRuntimeServiceLayer)
			: resolvedOperations
				? (Layer.mergeAll(
						Layer.succeed(HevyOperationsService, resolvedOperations),
						Layer.succeed(ExerciseTemplateCatalogService, effectiveCatalog),
					) as ToolRuntimeServiceLayer)
				: (Layer.succeed(
						ExerciseTemplateCatalogService,
						effectiveCatalog,
					) as ToolRuntimeServiceLayer);
	const layer = effectiveObserver
		? coreLayer
			? (Layer.merge(
					coreLayer,
					createToolObserverLayer(effectiveObserver),
				) as ToolRuntimeServiceLayer)
			: (createToolObserverLayer(effectiveObserver) as ToolRuntimeServiceLayer)
		: coreLayer;
	const services =
		providedServices ??
		(layer
			? createCoreServiceContext({
					client: effectiveClient ?? undefined,
					catalog: effectiveCatalog,
					execution,
					operations: resolvedOperations ?? undefined,
					observer: effectiveObserver,
				})
			: undefined);
	const effectHandlerFactory: ToolHandlerFactory =
		createHandler ??
		(<TParams extends object>(
			fn: ToolEffectHandler<TParams>,
			context: string,
		) =>
			withErrorHandling(
				(args: TParams, requestContext?: ToolExecutionContext) =>
					runToolEffect(
						fn,
						args,
						requestContext,
						services,
						lifecycleSignal,
						executionTimeoutMs,
						effectiveExecutionDeadline,
					),
				context,
				undefined,
				logger,
			) as ToolHandler);
	const getService = <I extends ToolRuntimeServiceIdentifiers, S>(
		service: Context.Key<I, S>,
	): S => {
		if (service.key === HevyClientService.key) {
			requireClient(effectiveClient);
		}
		if (!services) {
			throw new Error("Core service layer is unavailable");
		}
		return Context.get(services, service);
	};
	const createObservedHandler: ToolHandlerFactory = <TParams extends object>(
		fn: ToolEffectHandler<TParams>,
		context: string,
		metadata?: ToolTelemetryMetadata,
	) => {
		// Compose observation around the resolved handler factory so a
		// caller-supplied `createHandler` stays in the path when an observer is
		// configured; without one, the raw effect runner preserves the default
		// withErrorHandling observation semantics.
		const resolvedHandler: (
			args: TParams,
			requestContext?: ToolExecutionContext,
		) => Promise<McpToolResponse> = createHandler
			? createHandler(fn, context, metadata)
			: (args, requestContext) =>
					runToolEffect(
						fn,
						args,
						requestContext,
						services,
						lifecycleSignal,
						executionTimeoutMs,
						effectiveExecutionDeadline,
					);
		return withErrorHandling(
			async (args: TParams, requestContext?: ToolExecutionContext) => {
				let scope;
				try {
					scope = memoizeObservationScope(
						effectiveObserver?.start(
							createSafeInvocation(context, args, metadata),
						),
					);
				} catch {
					scope = undefined;
				}
				const startedAt = Date.now();
				let handlerPromise: Promise<McpToolResponse> | undefined;
				const invokeHandler = () => {
					handlerPromise ??= resolvedHandler(args, requestContext);
					return handlerPromise;
				};
				try {
					let runPromise: Promise<McpToolResponse>;
					if (scope) {
						try {
							runPromise = scope.run(invokeHandler);
						} catch (observerError) {
							logCoreError(
								"MCP tool observer failure",
								resolveErrorPolicy(observerError, "").diagnostic,
								logger,
							);
							runPromise = invokeHandler();
						}
					} else {
						runPromise = invokeHandler();
					}
					const result = await runPromise.catch((observerError) => {
						logCoreError(
							"MCP tool observer failure",
							resolveErrorPolicy(observerError, "").diagnostic,
							logger,
						);
						return invokeHandler();
					});
					const telemetry = {
						outcome: result.isError ? "returned_error" : "success",
						durationMs: Date.now() - startedAt,
						errorOutcome: result.errorOutcome,
						result: {
							isError: Boolean(result.isError),
							hasStructuredContent: result.structuredContent !== undefined,
							contentCountBucket: bucketCount(result.content.length),
							summary: getResultTelemetry(result),
						},
					} satisfies ToolCompletionObservation;
					void scope?.finish(telemetry);
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
			undefined,
			logger,
		) as ToolHandler;
	};
	const observedHandlerFactory = effectiveObserver
		? createObservedHandler
		: effectHandlerFactory;
	const runtime: ToolRuntime = {
		client: effectiveClient,
		catalog: effectiveCatalog,
		layer,
		services,
		logger,
		execution,
		executionTimeoutMs,
		executionDeadline: effectiveExecutionDeadline,
		lifecycleSignal,
		operations: resolvedOperations,
		createHandler: observedHandlerFactory,
		service: getService,
		getClient: () =>
			effectiveClient && services
				? getService(HevyClientService)
				: requireClient(effectiveClient),
		getOperations: () =>
			resolvedOperations && services
				? getService(HevyOperationsService)
				: (resolvedOperations ??
					createOperations(requireClient(effectiveClient))),
		forExecution: (nextExecution) =>
			(() => {
				const nested: {
					-readonly [K in keyof ToolExecutionContext]?: ToolExecutionContext[K];
				} = {};
				if (nextExecution) Object.assign(nested, nextExecution);
				nested.signal = mergeAbortSignals(
					lifecycleSignal,
					nextExecution?.signal,
				);
				nested.deadline = nextExecution?.deadline ?? effectiveExecutionDeadline;
				const nestedExecution = nested as ToolExecutionContext;
				const nestedBaseClient = rawClient;
				const contextCatalog = services
					? Context.getOption(services, ExerciseTemplateCatalogService)
					: Option.none();
				const nestedBaseCatalog = Option.isSome(contextCatalog)
					? contextCatalog.value
					: catalog;
				const nestedClient =
					nestedExecution && nestedBaseClient
						? bindClientExecution(
								requireClient(nestedBaseClient),
								nestedExecution,
							)
						: effectiveClient;
				const nestedCatalog = {
					effect: (options = {}) =>
						nestedBaseCatalog.effect({
							...options,
							execution: nestedExecution,
						}),
					get: (options = {}) =>
						nestedBaseCatalog.get({
							...options,
							execution: nestedExecution,
						}),
					reset: () => nestedBaseCatalog.reset(),
				};
				return createToolRuntime({
					client: nestedBaseClient,
					baseClient: nestedBaseClient,
					operations: resolvedOperations ?? undefined,
					catalog,
					logger,
					createHandler,
					observer: effectiveObserver,
					services: services
						? overlayCoreServiceContext(services, {
								client: nestedClient ?? undefined,
								catalog: nestedCatalog,
								execution: nestedExecution,
							})
						: undefined,
					execution: nestedExecution,
					executionTimeoutMs,
					executionDeadline:
						nextExecution?.deadline ?? effectiveExecutionDeadline,
					lifecycleSignal,
				});
			})(),
	};
	return runtime;
}

export { HEVY_CLIENT_NOT_INITIALIZED_ERROR };
