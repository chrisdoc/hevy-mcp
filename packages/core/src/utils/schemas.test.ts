import { describe, expect, it } from "vitest";
import { calendarDate } from "../tools/input-schemas.js";
import {
	equipmentCategoryEnum,
	exerciseTypeEnum,
	muscleGroupEnum,
	setTypeEnum,
	utcSecondTimestamp,
	zNullableInt,
	zNullableNumber,
	zOptionalRepRange,
	zStrictOptionalRepRange,
} from "./schemas.js";

describe("shared tool schemas", () => {
	it("normalizes nullable integer inputs", () => {
		expect(zNullableInt.parse(null)).toBeNull();
		expect(zNullableInt.parse(4)).toBe(4);
		expect(zNullableInt.parse(" 42 ")).toBe(42);
		expect(zNullableInt.parse("")).toBeUndefined();
		expect(zNullableInt.parse(" NULL ")).toBeNull();
		expect(zNullableInt.parse("undefined")).toBeUndefined();
		expect(zNullableInt.safeParse("not-a-number").success).toBe(false);
	});

	it("accepts optional nullable numbers", () => {
		expect(zNullableNumber.parse("")).toBeUndefined();
		expect(zNullableNumber.parse("3.5")).toBe(3.5);
		expect(zNullableNumber.parse(null)).toBeNull();
		expect(zNullableNumber.parse(undefined)).toBeUndefined();
	});

	it("normalizes optional repetition ranges", () => {
		expect(zOptionalRepRange.parse(null)).toBeUndefined();
		expect(zOptionalRepRange.parse({ start: "5", end: " 8 " })).toEqual({
			start: 5,
			end: 8,
		});
	});

	it("rejects unknown keys in strict repetition ranges", () => {
		expect(
			zStrictOptionalRepRange.safeParse({ start: 5, end: 8, extra: true })
				.success,
		).toBe(false);
	});

	it("validates shared enum values and defaults", () => {
		expect(setTypeEnum.parse(undefined)).toBe("normal");
		expect(setTypeEnum.parse("warmup")).toBe("warmup");
		expect(muscleGroupEnum.parse("chest")).toBe("chest");
		expect(exerciseTypeEnum.parse("weight_reps")).toBe("weight_reps");
		expect(equipmentCategoryEnum.parse("dumbbell")).toBe("dumbbell");
	});

	it("rejects calendar rollovers and non-UTC timestamp variants", () => {
		expect(calendarDate.safeParse("2026-02-29").success).toBe(false);
		expect(calendarDate.safeParse("2026-07-16").success).toBe(true);
		expect(utcSecondTimestamp.safeParse("2026-02-29T12:00:00Z").success).toBe(
			false,
		);
		expect(
			utcSecondTimestamp.safeParse("2026-07-16T12:00:00+00:00").success,
		).toBe(false);
	});

	it("reports exactly one issue for invalid UTC timestamps", () => {
		const missingSeconds = utcSecondTimestamp.safeParse("2026-07-16T12:00Z");
		expect(missingSeconds.success).toBe(false);
		if (!missingSeconds.success) {
			expect(missingSeconds.error.issues).toHaveLength(1);
			expect(missingSeconds.error.issues[0]?.code).toBe("invalid_format");
			expect(missingSeconds.error.issues[0]?.message).toBe(
				"Must use the UTC format YYYY-MM-DDTHH:mm:ssZ",
			);
		}

		const offsetInsteadOfZ = utcSecondTimestamp.safeParse(
			"2026-07-16T12:00:00+05:30",
		);
		expect(offsetInsteadOfZ.success).toBe(false);
		if (!offsetInsteadOfZ.success) {
			expect(offsetInsteadOfZ.error.issues).toHaveLength(1);
		}

		const wellFormedButInvalidCalendarDate = utcSecondTimestamp.safeParse(
			"2026-02-29T12:00:00Z",
		);
		expect(wellFormedButInvalidCalendarDate.success).toBe(false);
		if (!wellFormedButInvalidCalendarDate.success) {
			expect(wellFormedButInvalidCalendarDate.error.issues).toHaveLength(1);
			expect(wellFormedButInvalidCalendarDate.error.issues[0]?.message).toBe(
				"Must use the UTC format YYYY-MM-DDTHH:mm:ssZ",
			);
		}
	});
});
