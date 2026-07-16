import type { McpClientLogger } from "../utils/mcp-client-logger.js";
import type { HevyClient } from "../utils/hevyClient.js";
import {
	HEVY_CLIENT_NOT_INITIALIZED_ERROR,
	requireClient,
} from "../utils/tool-helpers.js";
import { withErrorHandling } from "../utils/error-handler.js";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import type { McpToolResponse } from "../utils/response-formatter.js";

export type ToolHandler = (
	args: Record<string, unknown>,
) => Promise<McpToolResponse>;

export interface ToolRuntime {
	readonly client: HevyClient | null;
	readonly catalog: ExerciseTemplateCatalog;
	readonly logger?: McpClientLogger;
	readonly wrapHandler: typeof withErrorHandling;
	getClient(): HevyClient;
}

export interface CreateToolRuntimeOptions {
	client: HevyClient | null;
	catalog: ExerciseTemplateCatalog;
	logger?: McpClientLogger;
	wrapHandler?: typeof withErrorHandling;
}

export function createToolRuntime({
	client,
	catalog,
	logger,
	wrapHandler = withErrorHandling,
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
