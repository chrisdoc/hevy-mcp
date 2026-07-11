import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import { withErrorHandling } from "../utils/error-handler.js";
import type { McpClientLogger } from "../utils/mcp-client-logger.js";
import type { HevyClient } from "../utils/hevyClient.js";
import { registerBodyMeasurementTools } from "./body-measurements.js";
import { registerFolderTools } from "./folders.js";
import { registerRoutineTools } from "./routines.js";
import { registerTemplateTools } from "./templates.js";
import { registerUserTools } from "./user.js";
import { registerWorkoutTools } from "./workouts.js";

export interface RegisterHevyToolsOptions {
	catalog?: ExerciseTemplateCatalog;
	confirmMutations?: boolean;
	logger?: McpClientLogger;
	wrapHandler?: typeof withErrorHandling;
}

/** Register every Hevy tool in its production ordering. */
export function registerHevyTools(
	server: McpServer,
	hevyClient: HevyClient | null,
	options: RegisterHevyToolsOptions = {},
) {
	const wrapHandler = options.wrapHandler ?? withErrorHandling;
	registerWorkoutTools(server, hevyClient, {
		confirmMutations: options.confirmMutations,
		wrapHandler,
	});
	registerRoutineTools(server, hevyClient, {
		confirmMutations: options.confirmMutations,
		wrapHandler,
	});
	registerTemplateTools(server, hevyClient, {
		catalog: options.catalog,
		confirmMutations: options.confirmMutations,
		logger: options.logger,
		wrapHandler,
	});
	registerFolderTools(server, hevyClient, {
		confirmMutations: options.confirmMutations,
		wrapHandler,
	});
	registerBodyMeasurementTools(server, hevyClient, {
		confirmMutations: options.confirmMutations,
		wrapHandler,
	});
	registerUserTools(server, hevyClient, wrapHandler);
}
