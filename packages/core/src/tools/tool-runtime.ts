import type { McpClientLogger } from "../utils/mcp-client-logger.js";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import {
	HEVY_CLIENT_NOT_INITIALIZED_ERROR,
	requireClient,
} from "../utils/tool-helpers.js";
import { withErrorHandling } from "../utils/error-handler.js";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import type { McpToolResponse } from "../utils/response-formatter.js";
import type { ToolTelemetryMetadata } from "../utils/tool-taxonomy.js";
import { memoizeObservationScope, type ToolObserver } from "../observation.js";
import { bucketCount, getResultTelemetry } from "../utils/result-telemetry.js";
import { resolveErrorPolicy } from "../utils/error-policy.js";

const STRUCTURAL_ARGUMENT_KEYS = [
	"page",
	"pageSize",
	"since",
	"workoutId",
	"routineId",
	"folderId",
	"exerciseTemplateId",
	"date",
	"startDate",
	"endDate",
	"updatedSince",
	"includeCustom",
	"limit",
	"offset",
	"refresh",
	"query",
	"primaryMuscleGroup",
] as const;

const PRESENCE_ARGUMENT_KEYS: ReadonlySet<string> = new Set([
	"since",
	"workoutId",
	"routineId",
	"folderId",
	"exerciseTemplateId",
	"date",
	"startDate",
	"endDate",
	"updatedSince",
	"query",
	"primaryMuscleGroup",
] as const);

const NUMERIC_ARGUMENT_KEYS: ReadonlySet<string> = new Set([
	"page",
	"pageSize",
	"limit",
	"offset",
] as const);

const BOOLEAN_ARGUMENT_KEYS: ReadonlySet<string> = new Set([
	"includeCustom",
	"refresh",
]);

function createSafeInvocation(
	name: string,
	args: Record<string, unknown>,
	taxonomy: ToolTelemetryMetadata | undefined,
) {
	const argumentKeys = STRUCTURAL_ARGUMENT_KEYS.filter((key) => key in args);
	const argumentPresence: Record<string, true> = {};
	const numericArgumentBuckets: Record<
		string,
		ReturnType<typeof bucketCount>
	> = {};
	const booleanArguments: Record<string, boolean> = {};

	for (const key of argumentKeys) {
		const value = args[key];
		if (
			PRESENCE_ARGUMENT_KEYS.has(key) &&
			value !== null &&
			value !== undefined
		) {
			argumentPresence[key] = true;
		}
		if (NUMERIC_ARGUMENT_KEYS.has(key) && typeof value === "number") {
			numericArgumentBuckets[key] = bucketCount(value);
		}
		if (BOOLEAN_ARGUMENT_KEYS.has(key) && typeof value === "boolean") {
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

export type ToolHandler<
	TParams extends Record<string, unknown> = Record<string, unknown>,
> = (args: TParams) => Promise<McpToolResponse>;

export type ToolHandlerFactory = <TParams extends Record<string, unknown>>(
	fn: ToolHandler<TParams>,
	context: string,
	metadata?: ToolTelemetryMetadata,
) => ToolHandler;
export interface ToolRuntime {
	readonly client: HevyClient | null;
	readonly catalog: ExerciseTemplateCatalog;
	readonly logger?: McpClientLogger;
	readonly createHandler: ToolHandlerFactory;
	getClient(): HevyClient;
}

export interface CreateToolRuntimeOptions {
	client: HevyClient | null;
	catalog: ExerciseTemplateCatalog;
	logger?: McpClientLogger;
	createHandler?: ToolHandlerFactory;
	observer?: ToolObserver;
}

export const defaultHandlerFactory: ToolHandlerFactory = <
	TParams extends Record<string, unknown>,
>(
	fn: ToolHandler<TParams>,
	context: string,
) => withErrorHandling(fn, context);

export function createToolRuntime({
	client,
	catalog,
	logger,
	createHandler = defaultHandlerFactory,
	observer,
}: CreateToolRuntimeOptions): ToolRuntime {
	const createObservedHandler: ToolHandlerFactory = <
		TParams extends Record<string, unknown>,
	>(
		fn: ToolHandler<TParams>,
		context: string,
		metadata?: ToolTelemetryMetadata,
	) =>
		createHandler<TParams>(
			async (args: TParams) => {
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
					handlerPromise ??= Promise.resolve().then(() => fn(args));
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
	return {
		client,
		catalog,
		logger,
		createHandler: observedHandlerFactory,
		getClient: () => requireClient(client),
	};
}

export { HEVY_CLIENT_NOT_INITIALIZED_ERROR };
