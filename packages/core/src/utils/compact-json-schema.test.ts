import { describe, expect, it } from "vitest";
import { z } from "zod";
import { compactJsonSchema } from "./compact-json-schema.js";

describe("compactJsonSchema", () => {
	it("uses draft type arrays for nullable primitives", () => {
		const schema = z.object({
			count: z.number().int().nullable().optional(),
			label: z.string().nullable().optional(),
		});
		const compacted = compactJsonSchema(schema);

		expect(compacted).toBe(schema);
		expect(
			schema["~standard"].jsonSchema.input({ target: "draft-2020-12" }),
		).toEqual({
			type: "object",
			properties: {
				count: {
					type: ["integer", "null"],
					minimum: -9007199254740991,
					maximum: 9007199254740991,
				},
				label: { type: ["string", "null"] },
			},
		});
	});

	it("preserves Zod parsing and non-nullable schemas", () => {
		const schema = z.object({
			count: z.number().nullable().optional(),
			name: z.string(),
		});
		compactJsonSchema(schema);

		expect(schema.parse({ count: null, name: "set" })).toEqual({
			count: null,
			name: "set",
		});
		expect(schema.safeParse({ count: "1", name: "set" }).success).toBe(false);
	});
});
