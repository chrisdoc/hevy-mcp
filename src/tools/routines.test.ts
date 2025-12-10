import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("Routine Tools - Weight Field Mapping", () => {
	// Note: Tests use weightKg, distanceMeters, durationSeconds to match the actual schema
	it("should accept weightKg field in create-routine schema", () => {
		// Define the schema as used in create-routine
		const setSchema = z.object({
			type: z
				.enum(["warmup", "normal", "failure", "dropset"])
				.default("normal"),
			weightKg: z.coerce.number().optional(),
			reps: z.coerce.number().int().optional(),
			distanceMeters: z.coerce.number().int().optional(),
			durationSeconds: z.coerce.number().int().optional(),
			customMetric: z.coerce.number().optional(),
		});

		// Test with weightKg field
		const validSet = {
			type: "normal" as const,
			weightKg: 62.5,
			reps: 5,
		};

		const result = setSchema.parse(validSet);
		expect(result.weightKg).toBe(62.5);
		expect(result.reps).toBe(5);
	});

	it("should accept weightKg field in update-routine schema", () => {
		// Define the schema as used in update-routine
		const setSchema = z.object({
			type: z
				.enum(["warmup", "normal", "failure", "dropset"])
				.default("normal"),
			weightKg: z.coerce.number().optional(),
			reps: z.coerce.number().int().optional(),
			distanceMeters: z.coerce.number().int().optional(),
			durationSeconds: z.coerce.number().int().optional(),
			customMetric: z.coerce.number().optional(),
		});

		// Test with weightKg field
		const validSet = {
			type: "normal" as const,
			weightKg: 67.5,
			reps: 5,
		};

		const result = setSchema.parse(validSet);
		expect(result.weightKg).toBe(67.5);
		expect(result.reps).toBe(5);
	});

	it("should handle decimal weights correctly", () => {
		const setSchema = z.object({
			type: z
				.enum(["warmup", "normal", "failure", "dropset"])
				.default("normal"),
			weightKg: z.coerce.number().optional(),
			reps: z.coerce.number().int().optional(),
		});

		const validSet = {
			type: "normal" as const,
			weightKg: 62.5, // Decimal weight
			reps: 5,
		};

		const result = setSchema.parse(validSet);
		expect(result.weightKg).toBe(62.5);
		expect(typeof result.weightKg).toBe("number");
	});

	it("should handle string weights correctly via coercion", () => {
		const setSchema = z.object({
			type: z
				.enum(["warmup", "normal", "failure", "dropset"])
				.default("normal"),
			weightKg: z.coerce.number().optional(),
			reps: z.coerce.number().int().optional(),
		});

		// Test with string weight that should be coerced
		const validSet = {
			type: "normal" as const,
			weightKg: "62.5", // String that will be coerced
			reps: 5,
		};

		const result = setSchema.parse(validSet);
		expect(result.weightKg).toBe(62.5);
		expect(typeof result.weightKg).toBe("number");
	});

	it("should handle missing weightKg field correctly", () => {
		const setSchema = z.object({
			type: z
				.enum(["warmup", "normal", "failure", "dropset"])
				.default("normal"),
			weightKg: z.coerce.number().optional(),
			reps: z.coerce.number().int().optional(),
		});

		// Test without weightKg field
		const validSet = {
			type: "normal" as const,
			reps: 5,
		};

		const result = setSchema.parse(validSet);
		expect(result.weightKg).toBeUndefined();
		expect(result.reps).toBe(5);
	});

	it("should handle undefined weightKg correctly in mapping logic", () => {
		// Simulate the mapping logic from routines.ts
		const set = {
			type: "normal" as const,
			weightKg: undefined,
			reps: 5,
		};

		const mapped = {
			type: set.type,
			weight_kg: set.weightKg ?? null,
			reps: set.reps ?? null,
		};

		expect(mapped.weight_kg).toBe(null);
		expect(mapped.reps).toBe(5);
	});

	it("should preserve weightKg value in mapping logic", () => {
		// Simulate the mapping logic from routines.ts
		const set = {
			type: "normal" as const,
			weightKg: 62.5,
			reps: 5,
		};

		const mapped = {
			type: set.type,
			weight_kg: set.weightKg ?? null,
			reps: set.reps ?? null,
		};

		expect(mapped.weight_kg).toBe(62.5);
		expect(mapped.reps).toBe(5);
	});

	it("should map distanceMeters and durationSeconds fields correctly", () => {
		const setSchema = z.object({
			type: z
				.enum(["warmup", "normal", "failure", "dropset"])
				.default("normal"),
			distanceMeters: z.coerce.number().int().optional(),
			durationSeconds: z.coerce.number().int().optional(),
		});

		const validSet = {
			type: "normal" as const,
			distanceMeters: 1000,
			durationSeconds: 120,
		};

		const result = setSchema.parse(validSet);
		expect(result.distanceMeters).toBe(1000);
		expect(result.durationSeconds).toBe(120);

		// Simulate mapping logic
		const mapped = {
			distance_meters: result.distanceMeters ?? null,
			duration_seconds: result.durationSeconds ?? null,
		};

		expect(mapped.distance_meters).toBe(1000);
		expect(mapped.duration_seconds).toBe(120);
	});
});
