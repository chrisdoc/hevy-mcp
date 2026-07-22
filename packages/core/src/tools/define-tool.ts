import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { respond, type ResponseContract } from "../utils/response-formatter.js";
import {
	createTypedToolHandler,
	type InferToolParams,
} from "../utils/tool-helpers.js";
import type { ToolTelemetryMetadata } from "../utils/tool-taxonomy.js";
import type { ToolRuntime } from "./tool-runtime.js";

type ToolDefinitionBase<
	TSchema extends Record<string, z.ZodTypeAny>,
	TResult,
> = Pick<ToolTelemetryMetadata, "feature" | "operation"> & {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: TSchema;
	readonly annotations: ToolAnnotations;
	readonly responseContract: ResponseContract<TResult>;
	execute(
		runtime: ToolRuntime,
		args: InferToolParams<TSchema>,
	): Promise<TResult>;
};

export type ToolDefinition<
	TSchema extends Record<string, z.ZodTypeAny>,
	TResult,
> = ToolDefinitionBase<TSchema, TResult> &
	(
		| {
				readonly kind: "read";
				readonly outputSchema: z.ZodRawShape;
		  }
		| {
				readonly kind: "write";
				readonly outputSchema?: never;
		  }
	);

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
	const handler = runtime.createHandler(directHandler, definition.name, {
		feature: definition.feature,
		kind: definition.kind,
		operation: definition.operation,
	});
	const callback = handler;

	if (definition.kind === "read") {
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
