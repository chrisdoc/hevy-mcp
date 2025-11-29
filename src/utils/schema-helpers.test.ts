import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createPassthroughSchema } from "./schema-helpers.js";

describe("schema-helpers", () => {
	describe("createPassthroughSchema", () => {
		it("should parse valid data correctly", () => {
			const schema = createPassthroughSchema({
				page: z.number(),
				pageSize: z.number(),
			});

			const result = schema.safeParse({ page: 1, pageSize: 10 });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toEqual({ page: 1, pageSize: 10 });
			}
		});

		it("should allow extra properties to pass through", () => {
			const schema = createPassthroughSchema({
				page: z.number(),
			});

			// These are the extra properties that n8n sends
			const result = schema.safeParse({
				page: 1,
				action: "getWorkouts",
				chatInput: "test",
				sessionId: "123",
				toolCallId: "456",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.page).toBe(1);
				// Extra properties should be preserved
				expect(result.data.action).toBe("getWorkouts");
				expect(result.data.chatInput).toBe("test");
				expect(result.data.sessionId).toBe("123");
				expect(result.data.toolCallId).toBe("456");
			}
		});

		it("should still validate required properties", () => {
			const schema = createPassthroughSchema({
				page: z.number(),
				pageSize: z.number(),
			});

			const result = schema.safeParse({ page: 1 });
			expect(result.success).toBe(false);
		});

		it("should still validate property types", () => {
			const schema = createPassthroughSchema({
				page: z.number(),
			});

			const result = schema.safeParse({ page: "not a number" });
			expect(result.success).toBe(false);
		});

		it("should work with optional properties", () => {
			const schema = createPassthroughSchema({
				page: z.number().default(1),
				pageSize: z.number().optional(),
			});

			const result = schema.safeParse({
				toolCallId: "test",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.page).toBe(1);
				expect(result.data.pageSize).toBeUndefined();
				expect(result.data.toolCallId).toBe("test");
			}
		});

		it("should work with empty schema shape", () => {
			const schema = createPassthroughSchema({});

			const result = schema.safeParse({
				action: "test",
				sessionId: "123",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.action).toBe("test");
				expect(result.data.sessionId).toBe("123");
			}
		});

		it("should work with nested objects", () => {
			const schema = createPassthroughSchema({
				exercises: z.array(
					z.object({
						name: z.string(),
					}),
				),
			});

			const result = schema.safeParse({
				exercises: [{ name: "Bench Press" }],
				toolCallId: "456",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.exercises).toEqual([{ name: "Bench Press" }]);
				expect(result.data.toolCallId).toBe("456");
			}
		});
	});
});
