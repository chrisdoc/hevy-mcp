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
				readonly outputSchema?: z.ZodRawShape;
		  }
	);

type AnyToolDefinition = ToolDefinition<Record<string, z.ZodTypeAny>, unknown>;

/**
 * One-time-per-isolate registration metadata for each tool definition.
 *
 * Building a tool's compact JSON Schema (and the SDK's eager wire conversion
 * of the `compactJsonSchema`-wrapped schema on registration) is the dominant
 * CPU cost when constructing an MCP server. Tool definitions are module-level
 * constants, so this metadata can be computed once and shared by every server
 * a single isolate builds. The SDK's `registerTool` reads the schema strictly
 * through the Standard Schema interface and never mutates it, so sharing the
 * memoized config across concurrent servers is safe.
 *
 * Keep the memo lazy: CLI and test processes that never build a Hevy server
 * pay nothing. Isolate-based edge runtimes that want the one-time conversion
 * moved into module-scope (outside request CPU) call `preloadHevyToolSchemas`.
 */
const registeredToolConfigCache = new WeakMap<
	AnyToolDefinition,
	RegisteredToolConfig
>();

export function getRegisteredToolConfig(
	definition: AnyToolDefinition,
): RegisteredToolConfig {
	const cached = registeredToolConfigCache.get(definition);
	if (cached) return cached;
	const config: RegisteredToolConfig = {
		description: definition.description,
		inputSchema: compactJsonSchema(z.strictObject(definition.inputSchema)),
		annotations: definition.annotations,
	};
	if (definition.outputSchema) {
		config.outputSchema = compactJsonSchema(z.object(definition.outputSchema));
	}
	registeredToolConfigCache.set(definition, config);
	return config;
}

export function registerToolDefinition(
	server: ToolRegistrar,
	runtime: ToolRuntime,
	definition: AnyToolDefinition,
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

	const config = getRegisteredToolConfig(definition);
	server.registerTool(definition.name, config, (args, context) =>
		handler(
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
