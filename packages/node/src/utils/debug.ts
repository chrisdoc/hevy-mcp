import { z } from "zod";

const numberSchema = z.number();

function isObjectLike<T>(value: T): value is T & object {
	return (
		value !== null &&
		Object(value) === value &&
		Object.prototype.toString.call(value) !== "[object Function]"
	);
}

function scalarTag<T>(value: T): string {
	return Object.prototype.toString.call(value).slice(8, -1).toLowerCase();
}

const DEBUG_PREFIX = "[hevy-mcp:debug] ";
const MAX_DEBUG_RECORD_LENGTH = 8_192;
const MAX_REDACTION_DEPTH = 4;
const MAX_OBJECT_KEYS = 20;

type RedactedValue =
	| number
	| bigint
	| string
	| {
			type: "array";
			length: number;
			items: Record<string, RedactedValue> | "[max-depth]";
			truncatedItems?: number;
	  }
	| {
			type: "object";
			fieldCount: number;
			fields: Record<string, RedactedValue> | "[max-depth]";
			truncatedFields?: number;
	  };

type DebugData = {
	readonly [key: string]: string | number | boolean | null | RedactedValue;
};

export function isDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return env.HEVY_MCP_DEBUG === "1";
}

function redactValue<T>(
	value: T,
	depth: number,
	seen: WeakSet<object>,
): RedactedValue {
	if (value === null) {
		return "[null]";
	}

	if (!isObjectLike(value)) {
		return `[${scalarTag(value)}]`;
	}

	if (seen.has(value)) {
		return "[circular]";
	}

	if (Array.isArray(value)) {
		const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
		const length =
			lengthDescriptor &&
			"value" in lengthDescriptor &&
			numberSchema.safeParse(lengthDescriptor.value).success
				? lengthDescriptor.value
				: 0;
		if (depth >= MAX_REDACTION_DEPTH) {
			return { type: "array", length, items: "[max-depth]" };
		}

		seen.add(value);
		try {
			const itemCount = Math.min(length, MAX_OBJECT_KEYS);
			const items: Record<string, RedactedValue> = {};
			for (let index = 0; index < itemCount; index += 1) {
				const descriptor = Object.getOwnPropertyDescriptor(
					value,
					String(index),
				);
				items[`item-${index + 1}`] =
					descriptor && "value" in descriptor
						? redactValue(descriptor.value, depth + 1, seen)
						: "[empty-or-accessor]";
			}

			const result: Extract<RedactedValue, { type: "array" }> = {
				type: "array",
				length,
				items,
			};
			if (length > MAX_OBJECT_KEYS)
				result.truncatedItems = length - MAX_OBJECT_KEYS;
			return result;
		} finally {
			seen.delete(value);
		}
	}

	const keys = Object.keys(value);
	if (depth >= MAX_REDACTION_DEPTH) {
		return {
			type: "object",
			fieldCount: keys.length,
			fields: "[max-depth]",
		};
	}

	seen.add(value);
	try {
		const fields: Record<string, RedactedValue> = {};
		for (const [index, rawKey] of keys.slice(0, MAX_OBJECT_KEYS).entries()) {
			const descriptor = Object.getOwnPropertyDescriptor(value, rawKey);
			fields[`field-${index + 1}`] =
				descriptor && "value" in descriptor
					? redactValue(descriptor.value, depth + 1, seen)
					: "[accessor]";
		}

		const result: Extract<RedactedValue, { type: "object" }> = {
			type: "object",
			fieldCount: keys.length,
			fields,
		};
		if (keys.length > MAX_OBJECT_KEYS)
			result.truncatedFields = keys.length - MAX_OBJECT_KEYS;
		return result;
	} finally {
		seen.delete(value);
	}
}

/** Redact every input scalar while preserving bounded argument structure. */
export function redactToolArgs<T>(args: T): RedactedValue {
	try {
		return redactValue(args, 0, new WeakSet<object>());
	} catch {
		return "[unavailable]";
	}
}

/**
 * Write a single bounded structured debug record to stderr without throwing.
 */
export function debugLog(event: string, data: DebugData): void {
	if (!isDebugEnabled()) {
		return;
	}

	try {
		const record = JSON.stringify({ event, ...data });
		const output =
			record.length <= MAX_DEBUG_RECORD_LENGTH
				? record
				: JSON.stringify({ event, truncated: true });
		process.stderr.write(`${DEBUG_PREFIX}${output}\n`);
	} catch {
		// Diagnostics must never affect tool or API behavior.
	}
}
