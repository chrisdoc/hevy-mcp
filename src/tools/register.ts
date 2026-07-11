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
	registerWorkoutTools(server, hevyClient, wrapHandler);
	registerRoutineTools(server, hevyClient, wrapHandler);
	registerTemplateTools(server, hevyClient, {
		catalog: options.catalog,
		logger: options.logger,
		wrapHandler,
	});
	registerFolderTools(server, hevyClient, wrapHandler);
	registerBodyMeasurementTools(server, hevyClient, wrapHandler);
	registerUserTools(server, hevyClient, wrapHandler);
}
