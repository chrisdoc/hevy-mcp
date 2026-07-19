import type { McpClientLogger } from "../utils/mcp-client-logger.js";
import type { HevyClient } from "../utils/hevyClient.js";
import {
	HEVY_CLIENT_NOT_INITIALIZED_ERROR,
	requireClient,
} from "../utils/tool-helpers.js";
import { withErrorHandling } from "../utils/error-handler.js";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import type { McpToolResponse } from "../utils/response-formatter.js";
import type { ToolTelemetryMetadata } from "../utils/tool-taxonomy.js";

export type ToolHandler<
	TParams extends Record<string, unknown> = Record<string, unknown>,
> = (args: TParams) => Promise<McpToolResponse>;

export type ToolHandlerWrapper = <TParams extends Record<string, unknown>>(
	fn: ToolHandler<TParams>,
	context: string,
	metadata?: ToolTelemetryMetadata,
) => ToolHandler<TParams>;
export interface ToolRuntime {
	readonly client: HevyClient | null;
	readonly catalog: ExerciseTemplateCatalog;
	readonly logger?: McpClientLogger;
	readonly wrapHandler: ToolHandlerWrapper;
	getClient(): HevyClient;
}

export interface CreateToolRuntimeOptions {
	client: HevyClient | null;
	catalog: ExerciseTemplateCatalog;
	logger?: McpClientLogger;
	wrapHandler?: ToolHandlerWrapper;
}

export const defaultToolHandlerWrapper: ToolHandlerWrapper = <
	TParams extends Record<string, unknown>,
>(
	fn: ToolHandler<TParams>,
	context: string,
) => withErrorHandling(fn, context);

export function createToolRuntime({
	client,
	catalog,
	logger,
	wrapHandler = defaultToolHandlerWrapper,
}: CreateToolRuntimeOptions): ToolRuntime {
	return {
		client,
		catalog,
		logger,
		wrapHandler,
		getClient: () => requireClient(client),
	};
}

export { HEVY_CLIENT_NOT_INITIALIZED_ERROR };
