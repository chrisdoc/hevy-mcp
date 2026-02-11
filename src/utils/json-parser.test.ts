import { describe, expect, it } from "vitest";
import { parseJsonArray } from "./json-parser";

describe("parseJsonArray", () => {
	describe("JSON string inputs", () => {
		it("should parse a valid JSON array string", () => {
			const input = '[{"id": 1, "name": "test"}]';
			const result = parseJsonArray(input);
			expect(result).toEqual([{ id: 1, name: "test" }]);
		});

		it("should parse an empty JSON array string", () => {
			const input = "[]";
			const result = parseJsonArray(input);
			expect(result).toEqual([]);
		});

		it("should parse a JSON array with nested objects", () => {
			const input = JSON.stringify([
				{
					exerciseTemplateId: "D04AC939",
					notes: "Tempo Squat notes...",
					restSeconds: 120,
					sets: [{ type: "normal", weight: 80, reps: 6 }],
				},
			]);
			const result = parseJsonArray(input);
			expect(result).toEqual([
				{
					exerciseTemplateId: "D04AC939",
					notes: "Tempo Squat notes...",
					restSeconds: 120,
					sets: [{ type: "normal", weight: 80, reps: 6 }],
				},
			]);
		});

		it("should parse a JSON object string (not just arrays)", () => {
			const input = '{"id": 1, "name": "test"}';
			const result = parseJsonArray(input);
			expect(result).toEqual({ id: 1, name: "test" });
		});

		it("should parse JSON primitives", () => {
			expect(parseJsonArray('"hello"')).toBe("hello");
			expect(parseJsonArray("123")).toBe(123);
			expect(parseJsonArray("true")).toBe(true);
			expect(parseJsonArray("null")).toBe(null);
		});

		it("should return invalid JSON string unchanged", () => {
			const invalidJson = "{invalid json}";
			const result = parseJsonArray(invalidJson);
			expect(result).toBe(invalidJson);
		});

		it("should return malformed JSON string unchanged", () => {
			const malformedJson = '{"incomplete": ';
			const result = parseJsonArray(malformedJson);
			expect(result).toBe(malformedJson);
		});

		it("should return empty string unchanged", () => {
			const result = parseJsonArray("");
			expect(result).toBe("");
		});
	});

	describe("non-string inputs", () => {
		it("should return native arrays unchanged", () => {
			const input = [{ id: 1, name: "test" }];
			const result = parseJsonArray(input);
			expect(result).toBe(input); // Should be same reference
			expect(result).toEqual([{ id: 1, name: "test" }]);
		});

		it("should return empty array unchanged", () => {
			const input: unknown[] = [];
			const result = parseJsonArray(input);
			expect(result).toBe(input);
		});

		it("should return objects unchanged", () => {
			const input = { id: 1, name: "test" };
			const result = parseJsonArray(input);
			expect(result).toBe(input);
		});

		it("should return null unchanged", () => {
			const result = parseJsonArray(null);
			expect(result).toBeNull();
		});

		it("should return undefined unchanged", () => {
			const result = parseJsonArray(undefined);
			expect(result).toBeUndefined();
		});

		it("should return numbers unchanged", () => {
			expect(parseJsonArray(123)).toBe(123);
			expect(parseJsonArray(0)).toBe(0);
			expect(parseJsonArray(-456.789)).toBe(-456.789);
		});

		it("should return booleans unchanged", () => {
			expect(parseJsonArray(true)).toBe(true);
			expect(parseJsonArray(false)).toBe(false);
		});
	});

	describe("edge cases", () => {
		it("should handle stringified nested arrays", () => {
			const input = JSON.stringify([
				[1, 2],
				[3, 4],
			]);
			const result = parseJsonArray(input);
			expect(result).toEqual([
				[1, 2],
				[3, 4],
			]);
		});

		it("should handle complex nested structures", () => {
			const complexObject = {
				array: [1, 2, 3],
				nested: {
					deep: {
						value: "test",
					},
				},
				nullValue: null,
			};
			const input = JSON.stringify(complexObject);
			const result = parseJsonArray(input);
			expect(result).toEqual(complexObject);
		});

		it("should handle whitespace in JSON strings", () => {
			const input = '  \n\t[\n  {\n    "id": 1\n  }\n]\n  ';
			const result = parseJsonArray(input);
			expect(result).toEqual([{ id: 1 }]);
		});
	});
});
