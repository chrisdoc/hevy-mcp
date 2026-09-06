import { Predicate } from "effect";
import type { z } from "zod";

export type RuntimeValue = z.input<z.ZodUnknown>;

export const isString: (value: RuntimeValue) => value is string =
	Predicate.isString;

export function isFiniteNumber(value: RuntimeValue): value is number {
	return Predicate.isNumber(value) && Number.isFinite(value);
}

export const isBoolean: (value: RuntimeValue) => value is boolean =
	Predicate.isBoolean;

export const isObject: (value: RuntimeValue) => value is object =
	Predicate.isObject;

export function isFunction(
	value: RuntimeValue,
): value is (...args: never[]) => unknown {
	return Predicate.isFunction(value);
}
