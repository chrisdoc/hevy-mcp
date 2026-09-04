import { createHevyMcpServer } from "@hevy-mcp/core";
import { createHevyClient } from "@hevy-mcp/hevy-client";
import type { NodeTransport } from "./utils/arguments.js";
import { assertApiKey } from "./utils/config.js";

/**
 * Create an unconnected MCP server for embedding in a Node application.
 *
 * This entry point intentionally contains no Node runtime bootstrap. It does
 * not read process state, probe Hevy, install process handlers, initialize
 * telemetry, or connect a transport. The embedding application owns those
 * concerns and the transport lifecycle.
 */
export function createNodeMcpServer(
	{ apiKey }: { apiKey: string },
	_transport: NodeTransport = "stdio",
	lifecycleSignal?: AbortSignal,
) {
	try {
		assertApiKey(apiKey);
		return Promise.resolve(
			createHevyMcpServer({
				createClient: ({ onLog }) =>
					createHevyClient({
						apiKey,
						onLog,
					}),
				lifecycleSignal,
			}),
		);
	} catch (error) {
		return Promise.reject(error);
	}
}

/**
 * Compatibility wrapper for the executable runtime. Importing this module
 * does not evaluate the runtime bootstrap; it is loaded only when invoked.
 */
export async function runStdioServer(): Promise<void> {
	const { runStdioServer: run } = await import("./runtime.js");
	return run();
}

/**
 * Compatibility wrapper for the executable runtime. Importing this module
 * does not evaluate the runtime bootstrap; it is loaded only when invoked.
 */
export async function runServer(): Promise<void> {
	const { runServer: run } = await import("./runtime.js");
	return run();
}
