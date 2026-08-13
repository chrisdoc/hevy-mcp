import { z } from "zod";

const stringSchema = z.string();
const numberSchema = z.number();
const booleanSchema = z.boolean();
const objectSchema = z.object({}).passthrough();
const functionSchema = z.function();
export type RuntimeValue = z.input<z.ZodUnknown>;

export function isString(value: RuntimeValue): value is string {
	return stringSchema.safeParse(value).success;
}

export function isFiniteNumber(value: RuntimeValue): value is number {
	return numberSchema.safeParse(value).success && Number.isFinite(value);
}

export function isBoolean(value: RuntimeValue): value is boolean {
	return booleanSchema.safeParse(value).success;
}

export function isObject(value: RuntimeValue): value is object {
	return value !== null && objectSchema.safeParse(value).success;
}

export function isFunction(
	value: RuntimeValue,
): value is (...args: never[]) => unknown {
	return functionSchema.safeParse(value).success;
}
