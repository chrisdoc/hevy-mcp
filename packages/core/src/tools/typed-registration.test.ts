import { Effect } from "effect";
import { expectTypeOf, it } from "vitest";
import { z } from "zod";
import type { CoreToolError } from "../effect-errors.js";
import type { ResponseContract } from "../utils/response-contracts.js";
import type { ToolEffectHandler } from "./tool-runtime.js";
import type { ToolRegistrar, ToolDefinition } from "./define-tool.js";
import { registerToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";

const responseContract: ResponseContract<{ value: string }> = {
	render: (data) => ({
		content: [{ type: "text", text: data.value }],
	}),
};

const firstSchema = {
	required: z.string(),
	defaulted: z.number().default(1),
	optional: z.boolean().optional(),
} as const;

const secondSchema = {
	choice: z.union([z.literal("one"), z.literal("two")]),
	nested: z.object({ enabled: z.boolean() }),
} as const;

const firstDefinition = {
	name: "first",
	feature: "workouts",
	operation: "get",
	description: "First test tool",
	inputSchema: firstSchema,
	annotations: {},
	kind: "read",
	outputSchema: { value: z.string() },
	responseContract,
	execute: (_runtime, args) =>
		Effect.succeed({
			value: `${args.required}:${args.defaulted}:${args.optional ?? false}`,
		}),
} satisfies ToolDefinition<typeof firstSchema, { value: string }>;

const secondDefinition = {
	name: "second",
	feature: "templates",
	operation: "search",
	description: "Second test tool",
	inputSchema: secondSchema,
	annotations: {},
	kind: "read",
	outputSchema: { value: z.string() },
	responseContract,
	execute: (_runtime, args) =>
		Effect.succeed({
			value: `${args.choice}:${args.nested.enabled}`,
		}),
} satisfies ToolDefinition<typeof secondSchema, { value: string }>;

function compileRealRegistrations(
	server: ToolRegistrar,
	runtime: ToolRuntime,
): void {
	registerToolDefinition(server, runtime, {
		name: "first",
		feature: "workouts",
		operation: "get",
		description: "First registration",
		inputSchema: firstSchema,
		annotations: {},
		kind: "read",
		outputSchema: { value: z.string() },
		responseContract,
		execute: (_runtime, args) => {
			expectTypeOf(args.required).toEqualTypeOf<string>();
			expectTypeOf(args.defaulted).toEqualTypeOf<number>();
			expectTypeOf(args.optional).toEqualTypeOf<boolean | undefined>();
			return Effect.succeed({ value: args.required });
		},
	});
	registerToolDefinition(server, runtime, {
		name: "second",
		feature: "templates",
		operation: "search",
		description: "Second registration",
		inputSchema: secondSchema,
		annotations: {},
		kind: "read",
		outputSchema: { value: z.string() },
		responseContract,
		execute: (_runtime, args) => {
			expectTypeOf(args.choice).toEqualTypeOf<"one" | "two">();
			expectTypeOf(args.nested.enabled).toEqualTypeOf<boolean>();
			// @ts-expect-error The second schema must not expose first-schema fields.
			void args.required;
			return Effect.succeed({ value: args.choice });
		},
	});
}
void compileRealRegistrations;

type FirstParams = Parameters<typeof firstDefinition.execute>[1];
type SecondParams = Parameters<typeof secondDefinition.execute>[1];
type HandlerFailure =
	ToolEffectHandler<{ value: string }> extends (
		...args: never[]
	) => Effect.Effect<unknown, infer Failure, never>
		? Failure
		: never;

it("keeps heterogeneous registration parameters and the exact handler failure union", () => {
	expectTypeOf<FirstParams>().toEqualTypeOf<{
		required: string;
		defaulted: number;
		optional?: boolean | undefined;
	}>();
	expectTypeOf<SecondParams>().toEqualTypeOf<{
		choice: "one" | "two";
		nested: { enabled: boolean };
	}>();
	expectTypeOf<FirstParams>().not.toEqualTypeOf<SecondParams>();
	expectTypeOf<HandlerFailure>().toEqualTypeOf<CoreToolError>();
});
