import { sanitizeDiagnosticText } from "../utils/sanitize-diagnostic-text.js";
import {
	createSafeErrorDiagnostic,
	SAFE_DOMAIN_ERROR_TAGS,
	type SafeErrorDiagnostic,
} from "./error-policy.js";
import { SafeUserError } from "./safe-user-error.js";
import { isObject } from "../utils/type-predicates.js";

type TaggedValue = {
	readonly _tag?: string;
	readonly path?: unknown;
};

function taggedValue(error: unknown): TaggedValue | undefined {
	return isObject(error) ? (error as TaggedValue) : undefined;
}

export const CLIENT_TRANSPORT_PATTERNS = [
	/^Bad Request: /i,
	/^Not Acceptable: /i,
	/^Unsupported Media Type: /i,
	/^Invalid Request: /i,
	/^Conflict: /i,
	/^Parse error/i,
	/^Session not found/i,
	/^Method not found/i,
	/^Invalid params/i,
	/is undeliverable: per-request stream is disconnected/i,
] as const;

const SAFE_ERROR_MESSAGE_PATTERNS = [
	// MCP SDK protocol and transport messages with bounded safe content
	/^Not Acceptable: Client must accept both/i,
	/^Unsupported Media Type: Request body must be/i,
	/^Invalid Request: /i,
	/^Conflict: Cannot establish session/i,
	/^Parse error: Invalid JSON-RPC message/i,
	/^Session not found/i,
	/^Method not found/i,
	/^Invalid params/i,
	/^Internal error/i,
	/is undeliverable: per-request stream is disconnected/i,
	// Worker and configuration messages
	/^Worker returned HTTP \d+/i,
	/^OAUTH_KV binding is not a KV namespace/i,
	/^Invalid Hevy API base URL/i,
	/^API client not initialized/i,
	/^The requested Hevy operation is unavailable/i,
	/^The request was canceled by the client/i,
	/^Unable to complete the request after multiple attempts/i,
	// Safe V8 runtime error messages (no syntax errors with raw snippets!)
	/^Cannot read propert(?:y|ies) of/i,
	/^Cannot set propert(?:y|ies) of/i,
	/\bis not a function$/i,
	/\bis not defined$/i,
	/^Maximum call stack size exceeded/i,
];

function isSafeProtocolVersionMessage(message: string): boolean {
	return /^Bad Request: Unsupported protocol version: /i.test(message);
}

function sanitizeProtocolVersionMessage(message: string): string {
	const match =
		/^Bad Request: Unsupported protocol version: (.*?) \(supported versions: (.*?)\)$/i.exec(
			message,
		);
	if (!match) {
		return "Bad Request: Unsupported protocol version";
	}
	const [, rawVersion, supported] = match;
	// Validate version string against standard MCP protocol versions (ISO date format YYYY-MM-DD, semver, or 'draft')
	const isSafe =
		/^(?:\d{4}-\d{2}-\d{2}|v?\d+\.\d+(?:\.\d+)?|draft)$/i.test(rawVersion) &&
		!rawVersion.includes("?") &&
		!rawVersion.includes("=") &&
		!rawVersion.includes("/") &&
		!rawVersion.includes("&");
	const version = isSafe ? rawVersion : "[invalid-or-unsupported]";
	return `Bad Request: Unsupported protocol version: ${version} (supported versions: ${supported})`;
}

/** Check if an error message matches a known safe error template. */
export function isSafeErrorMessage(message: string): boolean {
	if (isSafeProtocolVersionMessage(message)) return true;
	return SAFE_ERROR_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

/** Check if an error represents an expected client-side transport rejection (HTTP 4xx). */
export function isClientTransportError(error: unknown): boolean {
	if (
		error &&
		typeof error === "object" &&
		"name" in error &&
		error.name === "ZodError"
	) {
		return true;
	}
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "";
	if (CLIENT_TRANSPORT_PATTERNS.some((pattern) => pattern.test(message))) {
		return true;
	}
	if (
		error instanceof SyntaxError &&
		/Unexpected (?:token|end of JSON)|JSON\.parse/i.test(message)
	) {
		return true;
	}
	return false;
}

/**
 * Build an actionable, privacy-safe message string for error logs and issue detection.
 * Known safe templates and domain errors preserve their scrubbed description;
 * unclassified/unknown thrown values fall back to allowlisted category/status tokens
 * to guarantee that secrets and private data can never leak.
 */
export function formatSafeErrorLogMessage(
	context: string,
	error: unknown,
	diagnostic?: SafeErrorDiagnostic,
): string {
	const resolvedDiagnostic = diagnostic ?? createSafeErrorDiagnostic(error);

	// 1. Structured fallback for HTTP and external Hevy API errors (includes status, method, endpoint)
	// Evaluated first so real HevyHttpError failures retain their failing endpoint and status.
	if (
		resolvedDiagnostic.status !== undefined ||
		resolvedDiagnostic.category === "HevyHttpError" ||
		resolvedDiagnostic.endpoint !== undefined
	) {
		const parts: string[] = [resolvedDiagnostic.category];
		if (resolvedDiagnostic.code) {
			parts.push(`(${resolvedDiagnostic.code})`);
		}
		if (resolvedDiagnostic.status !== undefined) {
			parts.push(`(HTTP ${resolvedDiagnostic.status})`);
		}
		if (resolvedDiagnostic.method && resolvedDiagnostic.endpoint) {
			parts.push(
				`on ${resolvedDiagnostic.method} ${resolvedDiagnostic.endpoint}`,
			);
		}
		return `${context}: ${parts.join(" ")}`;
	}

	// 2. Domain errors and SafeUserError
	const tag = taggedValue(error)?._tag;
	const isDomainTagged = Boolean(tag && SAFE_DOMAIN_ERROR_TAGS.has(tag));

	if (
		(isDomainTagged || error instanceof SafeUserError) &&
		error instanceof Error &&
		error.message
	) {
		const scrubbed = sanitizeDiagnosticText(error.message, 512);
		return `${context}: ${scrubbed}`;
	}

	// 3. SyntaxError: emit generic safe message to avoid leaking raw parsed input fragments
	if (error instanceof SyntaxError) {
		return `${context}: SyntaxError: Invalid JSON syntax`;
	}

	// 4. ZodError: emit field paths and standard issue codes only, discarding user-derived messages
	if (
		error &&
		typeof error === "object" &&
		"name" in error &&
		error.name === "ZodError" &&
		"issues" in error &&
		Array.isArray(error.issues)
	) {
		const issuesSummary = error.issues
			.slice(0, 3)
			.map((issue: { path?: (string | number)[]; code?: string }) => {
				const field =
					issue.path && issue.path.length > 0
						? issue.path.join(".")
						: "payload";
				const code = typeof issue.code === "string" ? issue.code : "invalid";
				return `${field}: ${code}`;
			})
			.join("; ");
		return `${context}: Validation error (${issuesSummary})`;
	}

	// 5. Safe error message templates
	if (error instanceof Error) {
		if (isSafeProtocolVersionMessage(error.message)) {
			return `${context}: ${sanitizeProtocolVersionMessage(error.message)}`;
		}
		if (isSafeErrorMessage(error.message)) {
			const scrubbed = sanitizeDiagnosticText(error.message, 512);
			const category = resolvedDiagnostic.category;
			const prefix = category && category !== "Error" ? `${category}: ` : "";
			return `${context}: ${prefix}${scrubbed}`;
		}
	}

	// 6. Generic fallback: category token only
	return `${context}: ${resolvedDiagnostic.category}`;
}
