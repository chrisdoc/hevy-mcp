const DEBUG_PREFIX = "[hevy-mcp:debug] ";
const MAX_DEBUG_RECORD_LENGTH = 8_192;
const MAX_REDACTION_DEPTH = 4;
const MAX_OBJECT_KEYS = 20;

type RedactedValue =
	| number
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

export function isDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return env.HEVY_MCP_DEBUG === "1";
}

function redactValue(
	value: unknown,
	depth: number,
	seen: WeakSet<object>,
): RedactedValue {
	if (value === null) {
		return "[null]";
	}

	if (typeof value !== "object") {
		return `[${typeof value}]`;
	}

	if (seen.has(value)) {
		return "[circular]";
	}

	if (Array.isArray(value)) {
		const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
		const length =
			lengthDescriptor &&
			"value" in lengthDescriptor &&
			typeof lengthDescriptor.value === "number"
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

			return {
				type: "array",
				length,
				items,
				...(length > MAX_OBJECT_KEYS
					? { truncatedItems: length - MAX_OBJECT_KEYS }
					: {}),
			};
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

		return {
			type: "object",
			fieldCount: keys.length,
			fields,
			...(keys.length > MAX_OBJECT_KEYS
				? { truncatedFields: keys.length - MAX_OBJECT_KEYS }
				: {}),
		};
	} finally {
		seen.delete(value);
	}
}

/** Redact every input scalar while preserving bounded argument structure. */
export function redactToolArgs(args: unknown): RedactedValue {
	try {
		return redactValue(args, 0, new WeakSet<object>());
	} catch {
		return "[unavailable]";
	}
}

/**
 * Write a single bounded structured debug record to stderr without throwing.
 */
export function debugLog(event: string, data: Record<string, unknown>): void {
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
