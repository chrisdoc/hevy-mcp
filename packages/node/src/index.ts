import { createHevyMcpServer } from "@hevy-mcp/core";
import { createHevyClient } from "@hevy-mcp/hevy-client";
import type { NodeTransport } from "./utils/arguments.js";
import { assertApiKey } from "./utils/config.js";
import type { NodeLifecycleHandle } from "./utils/node-lifecycle.js";

export type FeedbackResult =
	| { readonly accepted: true }
	| {
			readonly accepted: false;
			readonly reason:
				| "telemetry_disabled"
				| "telemetry_unavailable"
				| "rejected";
	  };

export interface AgentFeedbackRecorder {
	record(message: string): FeedbackResult;
}

/**
 * Create an unconnected MCP server for embedding in a Node application.
 *
 * This entry point intentionally contains no Node runtime bootstrap. It does
 * not read process state, probe Hevy, install process handlers, initialize
 * telemetry, or connect a transport. The embedding application owns those
 * concerns and the transport lifecycle.
 */
export interface CreateNodeMcpServerOptions {
	readonly apiKey: string;
	/** Optional caller-owned recorder for the privacy-safe feedback tool. */
	readonly feedbackRecorder?: AgentFeedbackRecorder;
}

export async function createNodeMcpServer(
	{ apiKey, feedbackRecorder }: CreateNodeMcpServerOptions,
	_transport: NodeTransport = "stdio",
	lifecycleSignal?: AbortSignal,
) {
	assertApiKey(apiKey);
	return await createHevyMcpServer({
		createClient: ({ onLog }) =>
			createHevyClient({
				apiKey,
				onLog,
			}),
		lifecycleSignal,
		feedbackRecorder,
	});
}

/**
 * Compatibility wrapper for the executable runtime. Importing this module
 * does not evaluate the runtime bootstrap; it is loaded only when invoked.
 */
export async function runStdioServer(): Promise<
	NodeLifecycleHandle | undefined
> {
	const { runStdioServer: run } = await import("./runtime.js");
	return run();
}

/**
 * Compatibility wrapper for the executable runtime. Importing this module
 * does not evaluate the runtime bootstrap; it is loaded only when invoked.
 */
export async function runServer(): Promise<NodeLifecycleHandle | undefined> {
	const { runServer: run } = await import("./runtime.js");
	return run();
}
