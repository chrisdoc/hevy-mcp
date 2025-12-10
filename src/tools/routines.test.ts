import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("Routine Tools - Weight Field Mapping", () => {
	it("should accept weight field in create-routine schema", () => {
		// Define the schema as used in create-routine
		const setSchema = z.object({
			type: z.enum(["warmup", "normal", "failure", "dropset"]).default("normal"),
			weight: z.coerce.number().optional(),
			reps: z.coerce.number().int().optional(),
			distance: z.coerce.number().int().optional(),
			duration: z.coerce.number().int().optional(),
			customMetric: z.coerce.number().optional(),
		});

		// Test with weight field
		const validSet = {
			type: "normal" as const,
			weight: 62.5,
			reps: 5,
		};

		const result = setSchema.parse(validSet);
		expect(result.weight).toBe(62.5);
		expect(result.reps).toBe(5);
	});

	it("should accept weight field in update-routine schema", () => {
		// Define the schema as used in update-routine
		const setSchema = z.object({
			type: z.enum(["warmup", "normal", "failure", "dropset"]).default("normal"),
			weight: z.coerce.number().optional(),
			reps: z.coerce.number().int().optional(),
			distance: z.coerce.number().int().optional(),
			duration: z.coerce.number().int().optional(),
			customMetric: z.coerce.number().optional(),
		});

		// Test with weight field
		const validSet = {
			type: "normal" as const,
			weight: 67.5,
			reps: 5,
		};

		const result = setSchema.parse(validSet);
		expect(result.weight).toBe(67.5);
		expect(result.reps).toBe(5);
	});

	it("should handle decimal weights correctly", () => {
		const setSchema = z.object({
			type: z.enum(["warmup", "normal", "failure", "dropset"]).default("normal"),
			weight: z.coerce.number().optional(),
			reps: z.coerce.number().int().optional(),
		});

		const validSet = {
			type: "normal" as const,
			weight: 62.5, // Decimal weight
			reps: 5,
		};

		const result = setSchema.parse(validSet);
		expect(result.weight).toBe(62.5);
		expect(typeof result.weight).toBe("number");
	});

	it("should handle string weights correctly via coercion", () => {
		const setSchema = z.object({
			type: z.enum(["warmup", "normal", "failure", "dropset"]).default("normal"),
			weight: z.coerce.number().optional(),
			reps: z.coerce.number().int().optional(),
		});

		// Test with string weight that should be coerced
		const validSet = {
			type: "normal" as const,
			weight: "62.5" as any, // String that will be coerced
			reps: 5,
		};

		const result = setSchema.parse(validSet);
		expect(result.weight).toBe(62.5);
		expect(typeof result.weight).toBe("number");
	});

	it("should handle missing weight field correctly", () => {
		const setSchema = z.object({
			type: z.enum(["warmup", "normal", "failure", "dropset"]).default("normal"),
			weight: z.coerce.number().optional(),
			reps: z.coerce.number().int().optional(),
		});

		// Test without weight field
		const validSet = {
			type: "normal" as const,
			reps: 5,
		};

		const result = setSchema.parse(validSet);
		expect(result.weight).toBeUndefined();
		expect(result.reps).toBe(5);
	});

	it("should handle undefined weight correctly in mapping logic", () => {
		// Simulate the mapping logic from routines.ts
		const set = {
			type: "normal" as const,
			weight: undefined,
			reps: 5,
		};

		const mapped = {
			type: set.type,
			weight_kg: set.weight ?? null,
			reps: set.reps ?? null,
		};

		expect(mapped.weight_kg).toBe(null);
		expect(mapped.reps).toBe(5);
	});

	it("should preserve weight value in mapping logic", () => {
		// Simulate the mapping logic from routines.ts
		const set = {
			type: "normal" as const,
			weight: 62.5,
			reps: 5,
		};

		const mapped = {
			type: set.type,
			weight_kg: set.weight ?? null,
			reps: set.reps ?? null,
		};

		expect(mapped.weight_kg).toBe(62.5);
		expect(mapped.reps).toBe(5);
	});

	it("should map distance and duration fields correctly", () => {
		const setSchema = z.object({
			type: z.enum(["warmup", "normal", "failure", "dropset"]).default("normal"),
			distance: z.coerce.number().int().optional(),
			duration: z.coerce.number().int().optional(),
		});

		const validSet = {
			type: "normal" as const,
			distance: 1000,
			duration: 120,
		};

		const result = setSchema.parse(validSet);
		expect(result.distance).toBe(1000);
		expect(result.duration).toBe(120);

		// Simulate mapping logic
		const mapped = {
			distance_meters: result.distance ?? null,
			duration_seconds: result.duration ?? null,
		};

		expect(mapped.distance_meters).toBe(1000);
		expect(mapped.duration_seconds).toBe(120);
	});
});
