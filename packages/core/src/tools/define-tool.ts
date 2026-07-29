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

	const inputSchema = compactJsonSchema(z.strictObject(definition.inputSchema));
	const config = {
		description: definition.description,
		inputSchema,
		annotations: definition.annotations,
		...(definition.kind === "read"
			? {
					outputSchema: compactJsonSchema(z.object(definition.outputSchema)),
				}
			: {}),
	};

	server.registerTool(definition.name, config, callback);
}
