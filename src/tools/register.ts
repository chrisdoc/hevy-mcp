import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpClientLogger } from "../utils/mcp-client-logger.js";
import type { HevyClient } from "../utils/hevyClient.js";
import { registerBodyMeasurementTools } from "./body-measurements.js";
import { registerFolderTools } from "./folders.js";
import { registerRoutineTools } from "./routines.js";
import { registerTemplateTools } from "./templates.js";
import { registerUserTools } from "./user.js";
import { registerWorkoutTools } from "./workouts.js";

export interface RegisterHevyToolsOptions {
	logger?: McpClientLogger;
}

/** Register every Hevy tool in its production ordering. */
export function registerHevyTools(
	server: McpServer,
	hevyClient: HevyClient | null,
	options: RegisterHevyToolsOptions = {},
) {
	registerWorkoutTools(server, hevyClient);
	registerRoutineTools(server, hevyClient);
	registerTemplateTools(server, hevyClient, { logger: options.logger });
	registerFolderTools(server, hevyClient);
	registerBodyMeasurementTools(server, hevyClient);
	registerUserTools(server, hevyClient);
}
