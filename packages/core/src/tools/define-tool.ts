import type { McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import { z } from "zod";
import { respond, type ResponseContract } from "../utils/response-contracts.js";
import { compactJsonSchema } from "../utils/compact-json-schema.js";
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

type RegisteredToolConfig = {
	description: string;
	inputSchema: ReturnType<typeof compactJsonSchema>;
	annotations: ToolAnnotations;
	outputSchema?: ReturnType<typeof compactJsonSchema>;
};

export type ToolRegistrar = Pick<McpServer, "registerTool">;

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
	server: ToolRegistrar,
	runtime: ToolRuntime,
	definition: ToolDefinition<Record<string, z.ZodTypeAny>, unknown>,
): void {
	const directHandler = createTypedToolHandler(
		definition.inputSchema,
		async (args, requestContext) =>
			respond(
				definition.responseContract,
				await definition.execute(
					requestContext ? runtime.forExecution(requestContext) : runtime,
					args,
				),
			),
	);
	const handler = runtime.createHandler(directHandler, definition.name, {
		feature: definition.feature,
		kind: definition.kind,
		operation: definition.operation,
	});
	const callback = handler;

	const inputSchema = compactJsonSchema(z.strictObject(definition.inputSchema));
	const config: RegisteredToolConfig = {
		description: definition.description,
		inputSchema,
		annotations: definition.annotations,
	};
	if (definition.kind === "read") {
		config.outputSchema = compactJsonSchema(
			z.object(definition.outputSchema as z.ZodRawShape),
		);
	}

	server.registerTool(definition.name, config, (args, context) =>
		callback(
			z.strictObject(definition.inputSchema).parse(args),
			context
				? {
						signal: context.mcpReq.signal,
						requestId: String(context.mcpReq.id),
					}
				: undefined,
		),
	);
}
