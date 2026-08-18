import { preloadCompactJsonSchema } from "../utils/compact-json-schema.js";
import {
	getRegisteredToolConfig,
	registerToolDefinition,
	type ToolRegistrar,
} from "./define-tool.js";
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

/**
 * Move the one-time tool schema conversion into module scope.
 *
 * Tool schemas are module-level constants, and their compact JSON Schema is
 * memoized per definition by `getRegisteredToolConfig`. Populating the memo is
 * not enough: `compactJsonSchema` stores the actual `z.toJSONSchema` work
 * behind lazy `input`/`output` closures, and the MCP SDK invokes those during
 * `registerTool`. This forces the exact conversions the SDK consumes (`input`
 * for each `inputSchema`, `output` for each read tool `outputSchema`) so a
 * first request only reads already-converted schemas.
 *
 * On isolate-based edge runtimes (Cloudflare Workers) module-scope work runs
 * during isolate warm-up, outside a request's billed CPU, so calling this at
 * module scope keeps the first request of a fresh isolate fast. Idempotent,
 * and a no-op after every conversion has been computed once.
 */
export function preloadHevyToolSchemas(): void {
	for (const definition of hevyToolDefinitions) {
		const config = getRegisteredToolConfig(definition);
		preloadCompactJsonSchema(config.inputSchema, "input");
		if (config.outputSchema) {
			preloadCompactJsonSchema(config.outputSchema, "output");
		}
	}
}

/** Register every Hevy tool in its production ordering. */
export function registerHevyTools(
	server: ToolRegistrar,
	runtime: ToolRuntime,
): void {
	for (const definition of hevyToolDefinitions) {
		registerToolDefinition(server, runtime, definition);
	}
}
