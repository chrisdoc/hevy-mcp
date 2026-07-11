import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWorkoutPrompts } from "./prompts/workouts.js";
import { registerHevyResources } from "./resources/hevy.js";
import {
	SERVER_INSTRUCTIONS,
	SERVER_NAME,
	SERVER_VERSION,
} from "./server-metadata.js";
import { registerHevyTools } from "./tools/register.js";
import { withErrorHandling } from "./utils/error-handler.js";
import { createExerciseTemplateCatalog } from "./utils/exercise-template-catalog.js";
import { createClient } from "./utils/hevyClient.js";
import type { HevyClient } from "./utils/hevyClient.js";
import type { HevyClientOptions } from "./utils/hevyClientKubb.js";
import { createMcpClientLogger } from "./utils/mcp-client-logger.js";

export interface SharedServerOptions {
	apiKey: string;
	clientOptions?: HevyClientOptions;
	hevyClient?: HevyClient;
	onToolsRegistered?: (count: number) => void;
	wrapHandler?: typeof withErrorHandling;
	wrapServer?: (server: McpServer) => McpServer;
}

function createToolCountingServer(server: McpServer) {
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

/** Construct and register a complete MCP server without importing Node-only code. */
export function createSharedMcpServer(options: SharedServerOptions): McpServer {
	const baseServer = new McpServer(
		{ name: SERVER_NAME, version: SERVER_VERSION },
		{ capabilities: { logging: {} }, instructions: SERVER_INSTRUCTIONS },
	);
	const server = options.wrapServer?.(baseServer) ?? baseServer;
	const logger = createMcpClientLogger(server);
	const hevyClient =
		options.hevyClient ??
		createClient(options.apiKey, "https://api.hevyapp.com", {
			...options.clientOptions,
			logger,
		});
	const wrapHandler = options.wrapHandler ?? withErrorHandling;
	const catalog = createExerciseTemplateCatalog();
	const counting = createToolCountingServer(server);

	registerHevyTools(counting.server, hevyClient, {
		catalog,
		logger,
		wrapHandler,
	});
	options.onToolsRegistered?.(counting.getCount());

	registerWorkoutPrompts(server);
	registerHevyResources(server, hevyClient, catalog);
	return server;
}
