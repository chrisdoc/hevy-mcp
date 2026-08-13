import { z } from "zod";

const stringSchema = z.string();
const numberSchema = z.number();
const booleanSchema = z.boolean();
const objectLikeSchema = z.union([
	z.object({}).passthrough(),
	z.array(z.unknown()),
]);

export function isString(value) {
	return stringSchema.safeParse(value).success;
}

export function isNumber(value) {
	return numberSchema.safeParse(value).success;
}

export function isBoolean(value) {
	return booleanSchema.safeParse(value).success;
}

export function isObjectLike(value) {
	return objectLikeSchema.safeParse(value).success;
}
