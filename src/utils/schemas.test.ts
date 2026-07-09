import { describe, expect, it } from "vitest";
import {
	equipmentCategoryEnum,
	exerciseTypeEnum,
	muscleGroupEnum,
	setTypeEnum,
	zNullableInt,
	zNullableNumber,
	zOptionalRepRange,
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

	it("validates shared enum values and defaults", () => {
		expect(setTypeEnum.parse(undefined)).toBe("normal");
		expect(setTypeEnum.parse("warmup")).toBe("warmup");
		expect(muscleGroupEnum.parse("chest")).toBe("chest");
		expect(exerciseTypeEnum.parse("weight_reps")).toBe("weight_reps");
		expect(equipmentCategoryEnum.parse("dumbbell")).toBe("dumbbell");
	});
});
