import type { ToolAnnotations } from "@modelcontextprotocol/server";
import { z } from "zod";
import type {
	HevyToolFeature,
	McpToolOperation,
} from "../utils/tool-taxonomy.js";
import { hevyToolDefinitions } from "./register.js";

/** The MCP revision used by the initial, deliberately bounded contract matrix. */
export const CONTRACT_MATRIX_PROTOCOL_VERSION = "2025-11-25" as const;

export interface ToolCapabilityDescriptor<
	TInput extends z.ZodRawShape = z.ZodRawShape,
	TOutput extends z.ZodRawShape = z.ZodRawShape,
> {
	readonly name: string;
	readonly feature: HevyToolFeature;
	readonly kind: "read";
	readonly operation: McpToolOperation;
	readonly description: string;
	readonly inputSchema: z.ZodObject<TInput>;
	readonly outputSchema: z.ZodObject<TOutput>;
	readonly annotations: ToolAnnotations;
}

export type ToolCapabilityCatalog = Readonly<
	Record<string, ToolCapabilityDescriptor>
>;

type ReadToolDefinition = Extract<
	(typeof hevyToolDefinitions)[number],
	{ readonly kind: "read" }
>;

function createCapabilityDescriptor<TDefinition extends ReadToolDefinition>(
	definition: TDefinition,
): ToolCapabilityDescriptor<
	TDefinition["inputSchema"],
	TDefinition["outputSchema"]
> {
	return {
		name: definition.name,
		feature: definition.feature,
		kind: definition.kind,
		operation: definition.operation,
		description: definition.description,
		inputSchema: z.strictObject(definition.inputSchema),
		outputSchema: z.object(definition.outputSchema),
		annotations: definition.annotations,
	};
}

const readCapabilityDescriptors = hevyToolDefinitions
	.filter(
		(definition): definition is ReadToolDefinition =>
			definition.kind === "read",
	)
	.map(createCapabilityDescriptor);

export const toolCapabilityCatalog: ToolCapabilityCatalog = Object.fromEntries(
	readCapabilityDescriptors.map((descriptor) => [descriptor.name, descriptor]),
);

const workoutsReadToolDefinition = hevyToolDefinitions.find(
	(
		definition,
	): definition is Extract<
		ReadToolDefinition,
		{ readonly name: "get-workouts" }
	> => definition.name === "get-workouts",
);
if (!workoutsReadToolDefinition) {
	throw new Error("Missing production get-workouts capability definition");
}

/** Production-owned descriptor for the first contract-matrix capability. */
export const getWorkoutsCapabilityDescriptor = createCapabilityDescriptor(
	workoutsReadToolDefinition,
);
