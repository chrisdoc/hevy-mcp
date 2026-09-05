import type { McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import { Effect } from "effect";
import { z } from "zod";
import { ClientNotInitializedError } from "../effect-errors.js";
import { HevyOperationsService } from "../effect-services.js";
import { respond, type ResponseContract } from "../utils/response-contracts.js";
import { compactJsonSchema } from "../utils/compact-json-schema.js";
import type { InferToolParams } from "../utils/tool-helpers.js";
import type { ToolTelemetryMetadata } from "../utils/tool-taxonomy.js";
import type { ToolRuntime } from "./tool-runtime.js";
import type { ToolExecutionContext } from "../execution.js";
import {
	ToolInputValidationError,
	type CoreToolError,
} from "../effect-errors.js";
import { normalizeCoreCause } from "./operation-helpers.js";

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
	): Effect.Effect<TResult, CoreToolError, never>;
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

type ToolDefinitionMetadata = {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: Record<string, z.ZodTypeAny>;
	readonly annotations: ToolAnnotations;
	readonly outputSchema?: z.ZodRawShape;
};
type RegistrationArgs = z.output<z.ZodObject<Record<string, z.ZodTypeAny>>>;

type UntypedToolDefinition = ToolDefinitionMetadata &
	Pick<ToolTelemetryMetadata, "feature" | "operation"> & {
		readonly kind: "read" | "write";
		readonly responseContract: ResponseContract<unknown>;
		execute(
			runtime: ToolRuntime,
			args: RegistrationArgs,
		): Effect.Effect<unknown, CoreToolError, never>;
	};

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
	ToolDefinitionMetadata,
	RegisteredToolConfig
>();

export function getRegisteredToolConfig(
	definition: ToolDefinitionMetadata,
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

export function registerToolDefinition<
	TSchema extends Record<string, z.ZodTypeAny>,
	TResult,
>(
	server: ToolRegistrar,
	runtime: ToolRuntime,
	definition: ToolDefinition<TSchema, TResult>,
): void;
export function registerToolDefinition(
	server: ToolRegistrar,
	runtime: ToolRuntime,
	definition: UntypedToolDefinition,
): void;
export function registerToolDefinition(
	server: ToolRegistrar,
	runtime: ToolRuntime,
	definition: UntypedToolDefinition,
): void {
	const directHandler = (
		args: RegistrationArgs,
		requestContext?: ToolExecutionContext,
	) =>
		Effect.suspend(() => {
			const scopedRuntime = requestContext
				? runtime.forExecution(requestContext)
				: runtime;
			// Fail inside the Effect so the tagged initialization error reaches
			// the collapse boundary instead of becoming an untyped defect.
			if (!scopedRuntime.client) {
				try {
					scopedRuntime.service(HevyOperationsService);
				} catch {
					return Effect.fail(new ClientNotInitializedError());
				}
			}
			return Effect.catchCause(
				Effect.suspend(() =>
					definition
						.execute(scopedRuntime, args)
						.pipe(
							Effect.map((data) => respond(definition.responseContract, data)),
						),
				),
				(cause) => Effect.failCause(normalizeCoreCause(cause)),
			);
		});
	const handler = runtime.createHandler(directHandler, definition.name, {
		feature: definition.feature,
		kind: definition.kind,
		operation: definition.operation,
	});
	const invalidInputHandler = runtime.createHandler(
		(args: { path: string }) =>
			Effect.fail(new ToolInputValidationError({ path: args.path })),
		definition.name,
		{
			feature: definition.feature,
			kind: definition.kind,
			operation: definition.operation,
		},
	);

	const config = getRegisteredToolConfig(definition);
	server.registerTool(definition.name, config, (args, context) => {
		try {
			const parsed = z.strictObject(definition.inputSchema).parse(args ?? {});
			return handler(
				parsed,
				context
					? {
							signal: context.mcpReq.signal,
							requestId: String(context.mcpReq.id),
						}
					: undefined,
			);
		} catch (error) {
			const path =
				error instanceof z.ZodError
					? error.issues[0]?.path
							?.map((segment) => String(segment))
							.join(".") || "arguments"
					: "arguments";
			if (context) {
				return invalidInputHandler(
					{ path },
					{
						signal: context.mcpReq.signal,
						requestId: String(context.mcpReq.id),
					},
				);
			}
			throw new ToolInputValidationError({ path });
		}
	});
}
