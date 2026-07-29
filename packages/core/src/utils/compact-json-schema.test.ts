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

	it("preserves refined non-empty object metadata in compact schemas", () => {
		const schema = z
			.strictObject({
				title: z.string().optional(),
				description: z.string().nullable().optional(),
			})
			.refine(
				(patch) => Object.values(patch).some((value) => value !== undefined),
				"Include at least one workout metadata field",
			)
			.meta({ minProperties: 1 });
		compactJsonSchema(schema);

		expect(
			schema["~standard"].jsonSchema.input({ target: "draft-2020-12" }),
		).toMatchObject({
			type: "object",
			additionalProperties: false,
			minProperties: 1,
		});
		expect(schema.safeParse({}).success).toBe(false);
		expect(schema.safeParse({ title: "Renamed" }).success).toBe(true);
	});
	it("omits redundant output object closure metadata", () => {
		const schema = z.object({
			nested: z.object({ value: z.string() }),
		});
		compactJsonSchema(schema);

		expect(
			schema["~standard"].jsonSchema.output({ target: "draft-2020-12" }),
		).toEqual({
			type: "object",
			properties: {
				nested: {
					type: "object",
					properties: { value: { type: "string" } },
					required: ["value"],
				},
			},
			required: ["nested"],
		});
	});
});
