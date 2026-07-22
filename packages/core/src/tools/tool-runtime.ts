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
import { getResultTelemetry } from "../utils/result-telemetry.js";

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
					const argumentKeys = Object.keys(args)
						.filter((key) =>
							[
								"id",
								"date",
								"page",
								"pageSize",
								"query",
								"title",
								"folderId",
								"exerciseTemplateId",
							].includes(key),
						)
						.slice(0, 8);
					const argumentKeyCount = Object.keys(args).length;
					scope = memoizeObservationScope(
						observer?.start({
							name: context,
							argumentKeys,
							argumentKeyCountBucket:
								argumentKeyCount === 0
									? "0"
									: argumentKeyCount === 1
										? "1"
										: argumentKeyCount <= 5
											? "2-5"
											: "6+",
						}),
					);
				} catch {
					scope = undefined;
				}
				const startedAt = Date.now();
				const handlerPromise = Promise.resolve().then(() => fn(args));
				try {
					let runPromise = handlerPromise;
					if (scope) {
						try {
							runPromise = scope.run(() => handlerPromise);
						} catch {
							// A synchronous instrumentation failure falls back to the
							// already-created handler promise below.
						}
					}
					const result = await runPromise.catch(() => handlerPromise);
					void scope?.finish({
						outcome: result.isError ? "returned_error" : "success",
						durationMs: Date.now() - startedAt,
						result: {
							isError: Boolean(result.isError),
							hasStructuredContent: result.structuredContent !== undefined,
							contentCount: result.content.length,
							summary: getResultTelemetry(result),
						},
					});
					return result;
				} catch (error) {
					void scope?.finish({
						outcome: "thrown_error",
						durationMs: Date.now() - startedAt,
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
