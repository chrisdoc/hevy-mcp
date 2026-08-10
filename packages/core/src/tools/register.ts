import type { McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { registerToolDefinition } from "./define-tool.js";
import { bodyMeasurementToolDefinitions } from "./body-measurements.js";
import { folderToolDefinitions } from "./folders.js";
import { routineToolDefinitions } from "./routines.js";
import { templateToolDefinitions } from "./templates.js";
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
	...workflowToolDefinitions,
	...routineDiscoveryToolDefinitions,
] as const;

type HevyToolDefinition = (typeof hevyToolDefinitions)[number];

/** Names accepted by the production Hevy tool registry. */
export type HevyToolName = HevyToolDefinition["name"];

type HevyToolDefinitionByName = {
	[TDefinition in HevyToolDefinition as TDefinition["name"]]: TDefinition;
};

/** Validated tool arguments derived from each production input schema. */
export type HevyToolArguments<TName extends HevyToolName> = z.infer<
	z.ZodObject<HevyToolDefinitionByName[TName]["inputSchema"]>
>;

/** Register every Hevy tool in its production ordering. */
export function registerHevyTools(
	server: McpServer,
	runtime: ToolRuntime,
): void {
	for (const definition of hevyToolDefinitions) {
		registerToolDefinition(server, runtime, definition);
	}
}
