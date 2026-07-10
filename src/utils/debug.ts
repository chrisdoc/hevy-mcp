const DEBUG_PREFIX = "[hevy-mcp:debug] ";
const MAX_DEBUG_RECORD_LENGTH = 8_192;
const MAX_REDACTION_DEPTH = 4;
const MAX_OBJECT_KEYS = 20;

const SENSITIVE_KEY_PATTERN =
	/(?:api[-_]?key|auth(?:orization)?|bearer|credential|password|secret|token)/i;
const USER_CONTENT_KEY_PATTERN =
	/(?:description|name|note|notes|query|text|title)/i;
const SAFE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

type RedactedValue =
	| boolean
	| number
	| null
	| string
	| { [key: string]: RedactedValue };

export function isDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return env.HEVY_MCP_DEBUG === "1";
}

function redactValue(
	value: unknown,
	depth: number,
	seen: WeakSet<object>,
): RedactedValue {
	if (value === null) {
		return "[redacted]";
	}

	if (typeof value !== "object") {
		return "[redacted]";
	}

	if (seen.has(value)) {
		return "[circular]";
	}

	if (Array.isArray(value)) {
		return { type: "array", length: value.length };
	}

	if (depth >= MAX_REDACTION_DEPTH) {
		return "[max-depth]";
	}

	seen.add(value);
	try {
		const keys = Object.keys(value);
		const result: Record<string, RedactedValue> = {};
		for (const rawKey of keys.slice(0, MAX_OBJECT_KEYS)) {
			const key = SAFE_KEY_PATTERN.test(rawKey) ? rawKey : "[redacted-key]";
			if (
				SENSITIVE_KEY_PATTERN.test(rawKey) ||
				USER_CONTENT_KEY_PATTERN.test(rawKey)
			) {
				result[key] = "[redacted]";
				continue;
			}

			const descriptor = Object.getOwnPropertyDescriptor(value, rawKey);
			if (!descriptor || !("value" in descriptor)) {
				result[key] = "[redacted]";
				continue;
			}

			result[key] = redactValue(descriptor.value, depth + 1, seen);
		}

		if (keys.length > MAX_OBJECT_KEYS) {
			result["[truncated-keys]"] = keys.length - MAX_OBJECT_KEYS;
		}

		return result;
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
