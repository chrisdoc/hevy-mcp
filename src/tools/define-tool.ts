import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { respond, type ResponseContract } from "../utils/response-formatter.js";
import {
	createTypedToolHandler,
	type InferToolParams,
} from "../utils/tool-helpers.js";
import type { ToolRuntime } from "./tool-runtime.js";

export interface ToolDefinition<
	TSchema extends Record<string, z.ZodTypeAny>,
	TResult,
> {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: TSchema;
	readonly annotations: ToolAnnotations;
	readonly kind: "read" | "write";
	readonly outputSchema?: z.ZodRawShape;
	readonly responseContract: ResponseContract<TResult>;
	execute(
		runtime: ToolRuntime,
		args: InferToolParams<TSchema>,
	): Promise<TResult>;
}

export function registerToolDefinition(
	server: McpServer,
	runtime: ToolRuntime,
	definition: ToolDefinition<Record<string, z.ZodTypeAny>, unknown>,
): void {
	const directHandler = createTypedToolHandler(
		definition.inputSchema,
		async (args) =>
			respond(
				definition.responseContract,
				await definition.execute(runtime, args),
			),
	);
	const handler = runtime.wrapHandler(directHandler, definition.name);
	const callback = (args: Record<string, unknown>) => handler(args);

	if (definition.kind === "read") {
		if (!definition.outputSchema) {
			throw new Error(`Read tool ${definition.name} requires outputSchema`);
		}
		server.registerTool(
			definition.name,
			{
				description: definition.description,
				inputSchema: definition.inputSchema,
				outputSchema: definition.outputSchema,
				annotations: definition.annotations,
			},
			callback,
		);
		return;
	}

	server.tool(
		definition.name,
		definition.description,
		definition.inputSchema,
		definition.annotations,
		callback,
	);
}
