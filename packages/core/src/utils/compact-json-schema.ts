import { z } from "zod";

type JsonSchema = Record<string, unknown>;

function isRecord(value: unknown): value is JsonSchema {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNullSchema(value: unknown): value is JsonSchema {
	return (
		isRecord(value) && value.type === "null" && Object.keys(value).length === 1
	);
}

function compactNullableSchema(value: unknown): unknown {
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
			typeof valueBranch.type === "string"
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

function omitOutputObjectRestrictions(value: unknown): unknown {
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
