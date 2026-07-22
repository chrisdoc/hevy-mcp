import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerToolDefinition } from "./define-tool.js";
import { bodyMeasurementToolDefinitions } from "./body-measurements.js";
import { folderToolDefinitions } from "./folders.js";
import { routineToolDefinitions } from "./routines.js";
import { templateToolDefinitions } from "./templates.js";
import { userToolDefinitions } from "./user.js";
import { routineDiscoveryToolDefinitions } from "./routine-discovery.js";
import { workflowToolDefinitions } from "./workflows.js";
import { workoutToolDefinitions } from "./workouts.js";
import type { ToolRuntime } from "./tool-runtime.js";

export const hevyToolDefinitions = [
	...workoutToolDefinitions,
	...routineToolDefinitions,
	...templateToolDefinitions,
	...folderToolDefinitions,
	...bodyMeasurementToolDefinitions,
	...userToolDefinitions,
	...workflowToolDefinitions,
	...routineDiscoveryToolDefinitions,
] as const;

/** Register every Hevy tool in its production ordering. */
export function registerHevyTools(
	server: McpServer,
	runtime: ToolRuntime,
): void {
	for (const definition of hevyToolDefinitions) {
		registerToolDefinition(server, runtime, definition);
	}
}
