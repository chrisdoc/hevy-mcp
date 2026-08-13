import { z } from "zod";

const objectSchema = z.object({}).passthrough();
const stringSchema = z.string();
function isObject<T>(value: T): value is T & object {
	return objectSchema.safeParse(value).success;
}
function isString<T>(value: T): value is T & string {
	return stringSchema.safeParse(value).success;
}

function scalar<T>(value: T): string {
	if (value === null || value === undefined) return "null";
	if (isObject(value)) return JSON.stringify(value);
	return isString(value) ? value : (JSON.stringify(value) ?? "");
}

export function human<T>(value: T): string {
	if (Array.isArray(value))
		return value.length
			? value.map((item) => human(item)).join("\n")
			: "No results.";
	if (!value || !isObject(value)) return scalar(value);
	const lines: string[] = [];
	for (const [key, item] of Object.entries(value)) {
		if (Array.isArray(item)) {
			lines.push(`${key}: ${item.length} item(s)`);
			for (const child of item.slice(0, 20)) {
				if (child && isObject(child))
					lines.push(
						`  - ${Object.entries(child)
							.map(([k, v]) => `${k}=${scalar(v)}`)
							.join(", ")}`,
					);
				else lines.push(`  - ${scalar(child)}`);
			}
		} else if (item && isObject(item)) {
			lines.push(`${key}:`);
			lines.push(
				...human(item)
					.split("\n")
					.map((line) => `  ${line}`),
			);
		} else lines.push(`${key}: ${scalar(item)}`);
	}
	return lines.join("\n") || "No results.";
}
