import { sanitizeDiagnosticText } from "../utils/sanitize-diagnostic-text.js";
import {
	createSafeErrorDiagnostic,
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

const SAFE_ERROR_MESSAGE_PATTERNS = [
	// MCP SDK protocol and transport messages
	/^Bad Request: /i,
	/^Not Acceptable: /i,
	/^Unsupported Media Type: /i,
	/^Invalid Request: /i,
	/^Conflict: /i,
	/^Parse error/i,
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
	/^Hevy API request failed/i,
	/^Unable to complete the request after multiple attempts/i,
	// Common JavaScript engine / V8 runtime errors (safe descriptions)
	/^Cannot read propert(?:y|ies) of/i,
	/^Cannot set propert(?:y|ies) of/i,
	/\bis not a function$/i,
	/\bis not defined$/i,
	/^Unexpected token/i,
	/^Unexpected end of JSON/i,
	/^Maximum call stack size exceeded/i,
];

/** Check if an error message matches a known safe error template. */
export function isSafeErrorMessage(message: string): boolean {
	return SAFE_ERROR_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

/** Check if an error represents an expected client-side transport rejection (HTTP 4xx). */
export function isClientTransportError(error: unknown): boolean {
	if (error instanceof SyntaxError) return true;
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
	return (
		message.startsWith("Bad Request") ||
		message.startsWith("Not Acceptable") ||
		message.startsWith("Unsupported Media Type") ||
		message.startsWith("Invalid Request") ||
		message.startsWith("Conflict") ||
		message.startsWith("Parse error") ||
		message.startsWith("Session not found") ||
		message.startsWith("Method not found") ||
		message.startsWith("Invalid params") ||
		message.includes("is undeliverable: per-request stream is disconnected")
	);
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
	const tag = taggedValue(error)?._tag;
	const isDomainTagged =
		tag === "WorkoutPrivacyError" ||
		tag === "WorkoutPayloadError" ||
		tag === "PaginationMismatchError" ||
		tag === "EmptyMeasurementUpdateError" ||
		tag === "TemplatesSearchValidationError" ||
		tag === "TrainingSummaryValidationError" ||
		tag === "TrainingSummaryDataError" ||
		tag === "ToolInputValidationError";

	if (
		(isDomainTagged || error instanceof SafeUserError) &&
		error instanceof Error &&
		error.message
	) {
		const scrubbed = sanitizeDiagnosticText(error.message, 512);
		return `${context}: ${scrubbed}`;
	}

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
			.map(
				(issue: { path?: (string | number)[]; message?: string }) =>
					`${issue.path && issue.path.length > 0 ? issue.path.join(".") : "payload"}: ${issue.message ?? "invalid"}`,
			)
			.join("; ");
		const scrubbed = sanitizeDiagnosticText(issuesSummary, 512);
		return `${context}: Validation error (${scrubbed})`;
	}

	if (error instanceof Error && isSafeErrorMessage(error.message)) {
		const scrubbed = sanitizeDiagnosticText(error.message, 512);
		const prefix =
			error.name && error.name !== "Error" ? `${error.name}: ` : "";
		return `${context}: ${prefix}${scrubbed}`;
	}

	// Fallback to allowlisted structural tokens (guaranteed secret-free)
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
