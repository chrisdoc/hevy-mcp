import type { Implementation } from "@modelcontextprotocol/sdk/types.js";
import type { ServerOptions } from "@modelcontextprotocol/sdk/server/index.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWorkoutPrompts } from "./prompts/workouts.js";
import { registerHevyResources } from "./resources/hevy.js";
import { registerBodyMeasurementTools } from "./tools/body-measurements.js";
import { registerFolderTools } from "./tools/folders.js";
import { registerRoutineTools } from "./tools/routines.js";
import {
	registerTemplateTools,
	type TemplateToolOptions,
} from "./tools/templates.js";
import { registerUserTools } from "./tools/user.js";
import { registerWorkoutTools } from "./tools/workouts.js";
import type { HevyClient } from "./utils/hevyClient.js";
import { serviceName, serviceVersion } from "./utils/telemetry.js";

export const HEVY_MCP_SERVER_INFO = {
	name: serviceName,
	version: serviceVersion,
} satisfies Implementation;

export const HEVY_MCP_SERVER_INSTRUCTIONS = [
	[
		"Hevy MCP connects clients to the authenticated user's Hevy",
		"workout-tracking data, including workouts, routines, exercise templates,",
		"routine folders, body measurements, and profile information.",
		"HEVY_API_KEY must contain a valid Hevy API key.",
	].join(" "),
	[
		"Safety: all get-* and search-* tools are read-only. create-* and",
		"update-* tools mutate Hevy data. Creates are additive and",
		"non-idempotent, so repeating one can create duplicates. Updates can",
		"overwrite existing data. Delete operations are not available.",
	].join(" "),
	[
		"Workflow: search exercise templates first, then use the returned",
		"template IDs when creating workouts or routines. To create a completed",
		"workout from a routine, fetch the routine as a plan, then obtain the",
		"actual completed sets and end time from the user; never invent completion",
		"data. Use the built-in workflow prompts when they match the task.",
	].join(" "),
	[
		"Pagination: start at page 1 and fetch only the pages needed. Most list",
		"tools allow pageSize up to 10; get-exercise-templates allows up to 100.",
	].join(" "),
	[
		"Rate limits and retries: minimize repeated calls. If Hevy returns HTTP",
		"429, follow its retry guidance. Transient read requests retry",
		"automatically, but write requests do not; confirm uncertain write",
		"outcomes before trying again.",
	].join(" "),
].join("\n\n");

export const HEVY_MCP_SERVER_OPTIONS = {
	capabilities: { logging: {} },
	instructions: HEVY_MCP_SERVER_INSTRUCTIONS,
} satisfies ServerOptions;

type RegistrationPhase = (register: () => void) => void;

export interface HevyMcpRegistrationOptions {
	readonly templateTools?: TemplateToolOptions;
	readonly toolServer?: McpServer;
	readonly registerTools?: RegistrationPhase;
	readonly registerResources?: RegistrationPhase;
}

function registerImmediately(register: () => void): void {
	register();
}

/** Register the complete production-owned Hevy MCP surface. */
export function registerHevyMcp(
	server: McpServer,
	hevyClient: HevyClient,
	options: HevyMcpRegistrationOptions = {},
): void {
	const toolServer = options.toolServer ?? server;
	const registerTools = options.registerTools ?? registerImmediately;
	const registerResources = options.registerResources ?? registerImmediately;

	registerTools(() => {
		registerWorkoutTools(toolServer, hevyClient);
		registerRoutineTools(toolServer, hevyClient);
		registerTemplateTools(toolServer, hevyClient, options.templateTools);
		registerFolderTools(toolServer, hevyClient);
		registerBodyMeasurementTools(toolServer, hevyClient);
		registerUserTools(toolServer, hevyClient);
	});

	registerWorkoutPrompts(server);
	registerResources(() => registerHevyResources(server, hevyClient));
}
