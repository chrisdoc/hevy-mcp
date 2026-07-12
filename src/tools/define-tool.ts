import type {
	McpServer,
	RegisteredTool,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { withErrorHandling } from "../utils/error-handler.js";
import type {
	McpToolResponse,
	StructuredMcpToolResponse,
} from "../utils/response-formatter.js";
import {
	describeTool,
	type ToolDescriptionParts,
} from "../utils/tool-descriptions.js";
import type { InferToolParams } from "../utils/tool-helpers.js";

export type ToolHandlerWrapper = typeof withErrorHandling;

interface DefineToolBase<TInput extends Record<string, z.ZodTypeAny>> {
	name: string;
	context?: string;
	description: ToolDescriptionParts;
	inputSchema: TInput;
	annotations: ToolAnnotations;
	wrapHandler?: ToolHandlerWrapper;
}

interface DefineLegacyTool<
	TInput extends Record<string, z.ZodTypeAny>,
> extends DefineToolBase<TInput> {
	outputSchema?: never;
	handler: (args: InferToolParams<TInput>) => Promise<McpToolResponse>;
}

interface DefineStructuredTool<
	TInput extends Record<string, z.ZodTypeAny>,
	TOutput extends Record<string, z.ZodTypeAny>,
> extends DefineToolBase<TInput> {
	outputSchema: TOutput;
	handler: (
		args: InferToolParams<TInput>,
	) => Promise<StructuredMcpToolResponse<InferToolParams<TOutput>>>;
}

export function defineTool<
	TInput extends Record<string, z.ZodTypeAny>,
	TOutput extends Record<string, z.ZodTypeAny>,
>(
	server: McpServer,
	definition: DefineStructuredTool<TInput, TOutput>,
): RegisteredTool;

export function defineTool<TInput extends Record<string, z.ZodTypeAny>>(
	server: McpServer,
	definition: DefineLegacyTool<TInput>,
): RegisteredTool;

export function defineTool<
	TInput extends Record<string, z.ZodTypeAny>,
	TOutput extends Record<string, z.ZodTypeAny>,
>(
	server: McpServer,
	definition: DefineStructuredTool<TInput, TOutput> | DefineLegacyTool<TInput>,
): RegisteredTool {
	const {
		name,
		context = name,
		description,
		inputSchema,
		annotations,
		wrapHandler = withErrorHandling,
		handler,
	} = definition;
	const callback = wrapHandler(handler, context);
	const inputObjectSchema = z.object(inputSchema);
	const formattedDescription = describeTool(description);
	if (definition.outputSchema) {
		return server.registerTool<TOutput, typeof inputObjectSchema>(
			name,
			{
				description: formattedDescription,
				inputSchema: inputObjectSchema,
				outputSchema: definition.outputSchema,
				annotations,
			},
			callback,
		);
	}

	return server.registerTool<Record<string, never>, typeof inputObjectSchema>(
		name,
		{
			description: formattedDescription,
			inputSchema: inputObjectSchema,
			annotations,
		},
		callback,
	);
}
