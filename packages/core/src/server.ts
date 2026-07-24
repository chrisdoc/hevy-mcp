import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HevyClient, HevyClientLogEvent } from "@hevy-mcp/hevy-client";
import { registerRoutinePrompts } from "./prompts/routines.js";
import { registerWorkoutPrompts } from "./prompts/workouts.js";
import { registerHevyResources } from "./resources/hevy.js";
import {
	SERVER_INSTRUCTIONS,
	SERVER_NAME,
	SERVER_VERSION,
} from "./server-metadata.js";
import { registerHevyTools } from "./tools/register.js";
import { createToolRuntime } from "./tools/tool-runtime.js";
import { createExerciseTemplateCatalog } from "./utils/exercise-template-catalog.js";
import { createMcpClientLogger } from "./utils/mcp-client-logger.js";
import type { ToolObserver } from "./observation.js";

export interface HevyClientFactoryContext {
	readonly onLog: (event: HevyClientLogEvent) => void;
}

export interface CreateHevyMcpServerOptions {
	readonly createClient: (context: HevyClientFactoryContext) => HevyClient;
	readonly observer?: ToolObserver;
	readonly decorateServer?: (server: McpServer) => McpServer;
	readonly onToolsRegistered?: (count: number) => void;
}

function createCountingServer(server: McpServer) {
	let count = 0;
	const countingServer = new Proxy(server, {
		get(target, property, receiver) {
			if (property === "tool") {
				return (...args: Parameters<McpServer["tool"]>) => {
					const result = target.tool(...args);
					count += 1;
					return result;
				};
			}
			if (property === "registerTool") {
				const registerTool: McpServer["registerTool"] = (
					name,
					config,
					callback,
				) => {
					const result = target.registerTool(name, config, callback);
					count += 1;
					return result;
				};
				return registerTool;
			}
			return Reflect.get(target, property, receiver);
		},
	});
	return { server: countingServer, getCount: () => count };
}

export function createHevyMcpServer(
	options: CreateHevyMcpServerOptions,
): McpServer {
	const baseServer = new McpServer(
		{ name: SERVER_NAME, version: SERVER_VERSION },
		{ capabilities: { logging: {} }, instructions: SERVER_INSTRUCTIONS },
	);
	const server = options.decorateServer?.(baseServer) ?? baseServer;
	const mcpLogger = createMcpClientLogger(server);
	const client = options.createClient({ onLog: (event) => mcpLogger(event) });
	const runtime = createToolRuntime({
		client,
		catalog: createExerciseTemplateCatalog(client),
		logger: mcpLogger,
		observer: options.observer,
	});
	const counting = createCountingServer(server);
	registerHevyTools(counting.server, runtime);
	options.onToolsRegistered?.(counting.getCount());
	registerWorkoutPrompts(server, options.observer);
	registerRoutinePrompts(server, options.observer);
	registerHevyResources(server, runtime);
	return server;
}
