import { z } from "zod";

const stringSchema = z.string();
const numberSchema = z.number();
const booleanSchema = z.boolean();
const objectSchema = z.object({}).passthrough();
const functionSchema = z.function();

export function isString(value: unknown): value is string {
	return stringSchema.safeParse(value).success;
}

export function isFiniteNumber(value: unknown): value is number {
	return numberSchema.safeParse(value).success && Number.isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
	return booleanSchema.safeParse(value).success;
}

export function isObject(value: unknown): value is object {
	return value !== null && objectSchema.safeParse(value).success;
}

export function isFunction(value: unknown): value is (...args: never[]) => unknown {
	return functionSchema.safeParse(value).success;
}
