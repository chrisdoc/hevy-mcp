import { describe, expect, it } from "vitest";
import {
	isBoolean,
	isFiniteNumber,
	isFunction,
	isObject,
	isString,
} from "./type-predicates.js";

describe("type-predicates", () => {
	it("checks strings correctly", () => {
		expect(isString("hello")).toBe(true);
		expect(isString("")).toBe(true);
		expect(isString(123)).toBe(false);
		expect(isString(null)).toBe(false);
		expect(isString(undefined)).toBe(false);
		expect(isString({})).toBe(false);
	});

	it("checks finite numbers correctly", () => {
		expect(isFiniteNumber(0)).toBe(true);
		expect(isFiniteNumber(42)).toBe(true);
		expect(isFiniteNumber(-3.14)).toBe(true);
		expect(isFiniteNumber(Number.NaN)).toBe(false);
		expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
		expect(isFiniteNumber(Number.NEGATIVE_INFINITY)).toBe(false);
		expect(isFiniteNumber("42")).toBe(false);
		expect(isFiniteNumber(null)).toBe(false);
	});

	it("checks booleans correctly", () => {
		expect(isBoolean(true)).toBe(true);
		expect(isBoolean(false)).toBe(true);
		expect(isBoolean(0)).toBe(false);
		expect(isBoolean("true")).toBe(false);
		expect(isBoolean(null)).toBe(false);
	});

	it("checks objects correctly", () => {
		expect(isObject({})).toBe(true);
		expect(isObject({ a: 1 })).toBe(true);
		expect(isObject([])).toBe(false);
		expect(isObject(null)).toBe(false);
		expect(isObject(undefined)).toBe(false);
		expect(isObject("string")).toBe(false);
		expect(isObject(123)).toBe(false);
	});

	it("checks functions correctly", () => {
		expect(isFunction(() => {})).toBe(true);
		expect(isFunction(function () {})).toBe(true);
		expect(isFunction(async () => {})).toBe(true);
		expect(isFunction({})).toBe(false);
		expect(isFunction(null)).toBe(false);
		expect(isFunction("function")).toBe(false);
	});
});
