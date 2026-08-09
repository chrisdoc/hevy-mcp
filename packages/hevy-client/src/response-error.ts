const MAX_RESPONSE_ERROR_INPUT_LENGTH = 4_096;
const MAX_RESPONSE_ERROR_LENGTH = 256;
const RESPONSE_ERROR_KEYS = ["error", "message", "detail"] as const;

const COOKIE_ASSIGNMENT = /(\b(?:cookie|set-cookie)\s*[:=]\s*)[^;\s]+/gi;
const SECRET_ASSIGNMENT =
	/(\b(?:authorization|proxy-authorization|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|id[-_ ]?token|token|client[-_ ]?secret|password|passwd|secret|credential|signature)\b\s*[:=]\s*)(?:"[^"]*"|'[^']*'|(?:Bearer\s+)?[^\s,;}"]+)/gi;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JSON_WEB_TOKEN =
	/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g;
const SECRET_QUERY_PARAMETER =
	/([?&](?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|token|signature|password|secret)=)[^&#\s]+/gi;
const HTTP_URL = /\bhttps?:\/\/[^\s<>"']+/gi;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID =
	/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

type ResponseErrorBody = {
	readonly error?: unknown;
	readonly message?: unknown;
	readonly detail?: unknown;
};

function isResponseErrorBody(value: unknown): value is ResponseErrorBody {
	return typeof value === "object" && value !== null;
}

function ownValue(value: object, key: PropertyKey): unknown {
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function responseErrorText(value: unknown): string | undefined {
	if (!isResponseErrorBody(value)) return undefined;
	for (const key of RESPONSE_ERROR_KEYS) {
		const candidate = ownValue(value, key);
		if (typeof candidate === "string") return candidate;
		if (!isResponseErrorBody(candidate)) continue;
		const nestedMessage = ownValue(candidate, "message");
		if (typeof nestedMessage === "string") return nestedMessage;
		const nestedDetail = ownValue(candidate, "detail");
		if (typeof nestedDetail === "string") return nestedDetail;
	}
	return undefined;
}

function removeControlCharacters(value: string): string {
	let output = "";
	for (const character of value) {
		const codePoint = character.codePointAt(0) ?? 0;
		if (codePoint <= 0x1f || codePoint === 0x7f) {
			if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) {
				output += " ";
			}
			continue;
		}
		output += character;
	}
	return output;
}

function truncate(value: string): string {
	return value.length > MAX_RESPONSE_ERROR_LENGTH
		? `${value.slice(0, MAX_RESPONSE_ERROR_LENGTH - 1)}…`
		: value;
}

function sanitizeResponseErrorText(value: string): string {
	const bounded = removeControlCharacters(
		value.slice(0, MAX_RESPONSE_ERROR_INPUT_LENGTH),
	);
	return truncate(
		bounded
			.replace(COOKIE_ASSIGNMENT, "$1[REDACTED]")
			.replace(SECRET_ASSIGNMENT, "$1[REDACTED]")
			.replace(BEARER_TOKEN, "Bearer [REDACTED]")
			.replace(JSON_WEB_TOKEN, "[JWT_REDACTED]")
			.replace(SECRET_QUERY_PARAMETER, "$1[REDACTED]")
			.replace(HTTP_URL, "[URL_REDACTED]")
			.replace(EMAIL, "[EMAIL_REDACTED]")
			.replace(UUID, "[ID_REDACTED]")
			.replace(/\s+/g, " ")
			.trim(),
	);
}

/** Extract one bounded, sanitized diagnostic string from an upstream error body. */
export function extractSafeResponseError(data: unknown): string | undefined {
	try {
		const text = responseErrorText(data);
		if (!text) return undefined;
		const sanitized = sanitizeResponseErrorText(text);
		return sanitized || undefined;
	} catch {
		return undefined;
	}
}
