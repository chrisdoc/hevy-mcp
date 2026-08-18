import type { JSONSchema } from "zod/v4/core";
import { z } from "zod";
import { isObject, isString } from "./type-predicates.js";
import type { RuntimeValue } from "./type-predicates.js";

type JsonSchema = Omit<JSONSchema.JSONSchema, "type"> & {
	type?: JSONSchema.JSONSchema["type"] | string[];
};

function isRecord(value: RuntimeValue): value is JsonSchema {
	return isObject(value) && !Array.isArray(value);
}

function isNullSchema(value: RuntimeValue): value is JsonSchema {
	return (
		isRecord(value) && value.type === "null" && Object.keys(value).length === 1
	);
}

let conversionCount = 0;

function compactNullableSchema(value: RuntimeValue): RuntimeValue {
	if (Array.isArray(value)) {
		return value.map(compactNullableSchema);
	}
	if (!isRecord(value)) {
		return value;
	}

	const anyOf = value.anyOf;
	if (Array.isArray(anyOf) && anyOf.length === 2) {
		const nullableBranch = anyOf.find(isNullSchema);
		const valueBranch = anyOf.find((branch) => !isNullSchema(branch));
		if (
			nullableBranch !== undefined &&
			isRecord(valueBranch) &&
			isString(valueBranch.type)
		) {
			const { anyOf: _anyOf, ...metadata } = value;
			return compactNullableSchema({
				...valueBranch,
				...metadata,
				type: [valueBranch.type, "null"],
			});
		}
	}

	return Object.fromEntries(
		Object.entries(value).map(([key, nested]) => [
			key,
			compactNullableSchema(nested),
		]),
	);
}

function omitOutputObjectRestrictions(value: RuntimeValue): RuntimeValue {
	if (Array.isArray(value)) {
		return value.map(omitOutputObjectRestrictions);
	}
	if (!isRecord(value)) {
		return value;
	}
	return Object.fromEntries(
		Object.entries(value)
			.filter(
				([key, nested]) => key !== "additionalProperties" || nested !== false,
			)
			.map(([key, nested]) => [key, omitOutputObjectRestrictions(nested)]),
	);
}

function convertSchema(
	schema: z.ZodTypeAny,
	io: "input" | "output",
): JsonSchema {
	conversionCount += 1;
	const converted = z.toJSONSchema(schema, {
		target: "draft-2020-12",
		io,
	});
	if (!isRecord(converted)) {
		throw new Error("Zod emitted a non-object root schema");
	}
	const compacted = compactNullableSchema(converted);
	if (!isRecord(compacted)) {
		throw new Error("Nullable schema compaction changed the root schema");
	}
	const output =
		io === "output" ? omitOutputObjectRestrictions(compacted) : compacted;
	if (!isRecord(output)) {
		throw new Error("Output schema compaction changed the root schema");
	}
	delete output.$schema;
	return output;
}

/**
 * Keep Zod validation while advertising a compact JSON Schema.
 *
 * Zod emits nullable values as `anyOf`; draft 2020-12 also permits a type
 * array. The MCP wire envelope does not need a repeated `$schema` marker, and
 * structured output is validated by the original Zod schema before sending.
 */
export function compactJsonSchema<TSchema extends z.ZodTypeAny>(
	schema: TSchema,
): TSchema {
	let inputSchema: JsonSchema | undefined;
	let outputSchema: JsonSchema | undefined;
	Object.defineProperty(schema["~standard"], "jsonSchema", {
		configurable: true,
		value: {
			input: () => {
				inputSchema ??= convertSchema(schema, "input");
				return inputSchema;
			},
			output: () => {
				outputSchema ??= convertSchema(schema, "output");
				return outputSchema;
			},
		},
		writable: true,
	});
	return schema;
}

/**
 * Force the compact JSON Schema conversion for one direction now instead of
 * lazily on first use.
 *
 * `compactJsonSchema` stores the conversion behind memoized `input`/`output`
 * closures so Node CLI and test processes never pay for a conversion they do
 * not use. On isolate-based edge runtimes (Cloudflare Workers), module-scope
 * work runs outside a request's billed CPU, so callers such as
 * `preloadHevyToolSchemas` can warm the memo for the exact directions the MCP
 * SDK consumes during `registerTool` (`input` for `inputSchema`, `output` for
 * `outputSchema`) and move the one-time cost out of the first request.
 * Calling again for an already-warm direction is a no-op.
 */
export function preloadCompactJsonSchema<TSchema extends z.ZodTypeAny>(
	schema: TSchema,
	io: "input" | "output",
): void {
	schema["~standard"].jsonSchema?.[io]({ target: "draft-2020-12" });
}

/**
 * Number of compact JSON Schema conversions computed in this process/isolate.
 *
 * Increments only on actual computation inside `convertSchema`, never on a
 * cached read, so tests can observe that a preload performed conversions and
 * that later server construction did not repeat them.
 */
export function getCompactJsonSchemaConversionCount(): number {
	return conversionCount;
}
