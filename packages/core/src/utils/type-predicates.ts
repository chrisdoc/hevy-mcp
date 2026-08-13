import { z } from "zod";

const stringSchema = z.string();
const numberSchema = z.number();
const booleanSchema = z.boolean();
const objectSchema = z.object({}).passthrough();
const functionSchema = z.function();
const runtimeValueSchema = z.unknown();
export type RuntimeValue = z.input<typeof runtimeValueSchema>;

export function isString(value: z.input<typeof runtimeValueSchema>): value is string {
	return stringSchema.safeParse(value).success;
}

export function isFiniteNumber(
	value: z.input<typeof runtimeValueSchema>,
): value is number {
	return numberSchema.safeParse(value).success && Number.isFinite(value);
}

export function isBoolean(value: z.input<typeof runtimeValueSchema>): value is boolean {
	return booleanSchema.safeParse(value).success;
}

export function isObject(value: z.input<typeof runtimeValueSchema>): value is object {
	return value !== null && objectSchema.safeParse(value).success;
}

export function isFunction(
	value: z.input<typeof runtimeValueSchema>,
): value is (...args: never[]) => unknown {
	return functionSchema.safeParse(value).success;
}
