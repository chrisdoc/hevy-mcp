import { randomUUID } from "node:crypto";
import { createSafeErrorDiagnostic } from "@hevy-mcp/core";
import { z } from "zod";
import { isHevyHttpError } from "@hevy-mcp/hevy-client";
import * as Sentry from "@sentry/node";
import { SpanStatusCode, trace, type Span } from "@opentelemetry/api";
import type { ErrorEvent, EventHint } from "@sentry/node";

type SafeErrorDiagnostic = ReturnType<typeof createSafeErrorDiagnostic>;
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type SentryExceptionValue = NonNullable<
	NonNullable<ErrorEvent["exception"]>["values"]
>[number];
type SentryStackFrame = NonNullable<
	NonNullable<SentryExceptionValue["stacktrace"]>["frames"]
>[number];
type SentryContext = { kind: FailureKind } & TelemetryAttributes & {
		"hevy.api.response_error"?: string;
	};

export type TelemetryAttributeValue = string | number | boolean;
export type TelemetryAttributes = Record<string, TelemetryAttributeValue>;

export type FailureKind =
	| "api"
	| "discovery"
	| "lifecycle"
	| "process"
	| "protocol"
	| "prompt"
	| "sdk"
	| "tool";

export interface FailureContext {
	readonly kind: FailureKind;
	readonly attributes?: TelemetryAttributes;
	readonly expected?: boolean;
	readonly span?: Span;
}

export interface NormalizedFailure {
	readonly diagnostic: SafeErrorDiagnostic;
	readonly exceptionType: string;
	readonly message?: string;
	readonly stack?: string;
	readonly responseError?: string;
	readonly exception: {
		readonly name: string;
		readonly message?: string;
		readonly stack?: string;
	};
	readonly attributes: TelemetryAttributes;
	readonly fingerprint: readonly string[];
}

export interface FailureReceipt {
	readonly diagnosticId?: string;
	readonly eventId?: string;
	readonly traceId?: string;
	readonly spanId?: string;
}

const MAX_ATTRIBUTE_LENGTH = 256;
const MAX_MESSAGE_LENGTH = 2_048;
const MAX_STACK_LENGTH = 16_384;
const SAFE_TAG_PREFIXES = [
	"error.",
	"exception.",
	"hevy.",
	"http.",
	"mcp.",
	"otel.",
	"service.",
] as const;
const TELEMETRY_ENABLED = process.env.HEVY_MCP_TELEMETRY !== "0";
const DIAGNOSTIC_DETAILS_ENABLED =
	process.env.HEVY_MCP_TELEMETRY_DIAGNOSTICS !== "0";

function isObject(value: unknown): value is object {
	return z.object({}).passthrough().safeParse(value).success;
}

function isString(value: unknown): value is string {
	return z.string().safeParse(value).success;
}

function isNumber(value: unknown): value is number {
	return z.number().safeParse(value).success;
}

function isBoolean(value: unknown): value is boolean {
	return z.boolean().safeParse(value).success;
}

function truncate(value: string, length: number): string {
	return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeHomePath(value: string): string {
	const home = process.env.HOME?.trim();
	const withConfiguredHome = home
		? value.replace(new RegExp(escapeRegExp(home), "g"), "~")
		: value;
	return withConfiguredHome.replace(/\/(?:Users|home)\/[^/\s]+/g, "~");
}

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function removeControlCharacters(value: string): string {
	let output = "";
	let inEscapeSequence = false;
	for (const character of value) {
		const codePoint = character.codePointAt(0) ?? 0;
		if (inEscapeSequence) {
			if (codePoint >= 0x40 && codePoint <= 0x7e) {
				inEscapeSequence = false;
			}
			continue;
		}
		if (codePoint === 0x1b) {
			inEscapeSequence = true;
			continue;
		}
		if (
			codePoint <= 0x1f &&
			codePoint !== 0x09 &&
			codePoint !== 0x0a &&
			codePoint !== 0x0d
		) {
			continue;
		}
		if (codePoint === 0x7f) continue;
		output += character;
	}
	return output;
}

/** Remove common credentials and URL payloads without inspecting object fields. */
export function sanitizeDiagnosticText(
	value: string,
	maxLength = MAX_MESSAGE_LENGTH,
): string {
	const withoutControlCharacters = removeControlCharacters(value);
	const withoutSecrets = withoutControlCharacters
		.replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
		.replace(
			/\b(api[-_ ]?key|authorization|password|secret|token)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
			"$1=[REDACTED]",
		)
		.replace(EMAIL, "[EMAIL_REDACTED]")
		.replace(/\bhttps?:\/\/[^\s)<>]+/gi, "[URL]");
	return truncate(removeHomePath(withoutSecrets).trim(), maxLength);
}

function sanitizeAttributeValue(
	_key: string,
	value: TelemetryAttributeValue,
): TelemetryAttributeValue {
	if (!isString(value)) return value;
	return sanitizeDiagnosticText(value, MAX_ATTRIBUTE_LENGTH);
}

function copyAttributes(
	attributes: TelemetryAttributes | undefined,
): TelemetryAttributes {
	if (!attributes) return {};
	const output: TelemetryAttributes = {};
	for (const [rawKey, rawValue] of Object.entries(attributes)) {
		const key = truncate(rawKey, 128);
		if (
			!key ||
			!SAFE_TAG_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
			(isNumber(rawValue) && !Number.isFinite(rawValue))
		) {
			continue;
		}
		output[key] = sanitizeAttributeValue(key, rawValue);
	}
	return output;
}

function getExceptionText(error: unknown): {
	message?: string;
	stack?: string;
} {
	if (!(error instanceof Error)) return {};
	const text: { message?: string; stack?: string } = {};
	if (error.message) text.message = error.message;
	if (error.stack) text.stack = error.stack;
	return text;
}

function getTraceContext(span: Span | undefined): {
	traceId?: string;
	spanId?: string;
} {
	try {
		const spanContext = span?.spanContext();
		if (!spanContext || !spanContext.traceId || !spanContext.spanId) {
			return {};
		}
		return { traceId: spanContext.traceId, spanId: spanContext.spanId };
	} catch {
		return {};
	}
}

function getFingerprint(
	kind: FailureKind,
	attributes: TelemetryAttributes,
	diagnostic: SafeErrorDiagnostic,
): string[] {
	const toolName =
		attributes["mcp.tool.name"] ?? attributes["mcp.prompt.name"] ?? "none";
	const exceptionType = String(attributes["error.type"] ?? "UNKNOWN_ERROR");
	const errorCategory = attributes["error.category"]
		? String(attributes["error.category"])
		: String(diagnostic.category);
	return [
		"mcp",
		kind,
		String(toolName),
		exceptionType,
		errorCategory,
		String(
			attributes["error.code"] ??
				attributes["http.response.status_code"] ??
				"none",
		),
	];
}

function addErrorAttributes(
	attributes: TelemetryAttributes,
	diagnostic: SafeErrorDiagnostic,
	expected: boolean | undefined,
): void {
	if (expected) attributes["error.expected"] = true;
	attributes["error.category"] ??= diagnostic.category;
	if (diagnostic.code) attributes["error.code"] ??= diagnostic.code;
}

function addHttpAttributes(
	attributes: TelemetryAttributes,
	diagnostic: SafeErrorDiagnostic,
): void {
	if (diagnostic.status !== undefined) {
		attributes["http.response.status_code"] ??= diagnostic.status;
	}
	if (diagnostic.method)
		attributes["http.request.method"] ??= diagnostic.method;
	if (diagnostic.endpoint)
		attributes["hevy.api.endpoint"] ??= diagnostic.endpoint;
}

function addExecutionAttributes(
	attributes: TelemetryAttributes,
	diagnostic: SafeErrorDiagnostic,
): void {
	if (diagnostic.outcome) attributes["hevy.api.outcome"] ??= diagnostic.outcome;
	if (diagnostic.phase) attributes["hevy.api.phase"] ??= diagnostic.phase;
	if (diagnostic.operation_safety) {
		attributes["hevy.api.operation_safety"] ??= diagnostic.operation_safety;
	}
	if (diagnostic.commit_state) {
		attributes["hevy.api.commit_state"] ??= diagnostic.commit_state;
	}
	if (diagnostic.safe_to_retry !== undefined) {
		attributes["hevy.api.safe_to_retry"] ??= diagnostic.safe_to_retry;
	}
}

export function normalizeFailure(
	error: unknown,
	context: FailureContext,
): NormalizedFailure {
	const diagnostic = createSafeErrorDiagnostic(error);
	const attributes = copyAttributes(context.attributes);
	const exceptionType = diagnostic.category;
	const text = getExceptionText(error);
	const message =
		DIAGNOSTIC_DETAILS_ENABLED && text.message
			? sanitizeDiagnosticText(text.message)
			: undefined;
	const stack =
		DIAGNOSTIC_DETAILS_ENABLED && text.stack
			? sanitizeDiagnosticText(text.stack, MAX_STACK_LENGTH)
			: undefined;
	const responseError =
		DIAGNOSTIC_DETAILS_ENABLED && isHevyHttpError(error) && error.responseError
			? sanitizeDiagnosticText(error.responseError, MAX_ATTRIBUTE_LENGTH)
			: undefined;

	attributes["exception.type"] = exceptionType;
	addErrorAttributes(attributes, diagnostic, context.expected);
	addHttpAttributes(attributes, diagnostic);
	addExecutionAttributes(attributes, diagnostic);

	const normalizedException: {
		name: string;
		message?: string;
		stack?: string;
	} = {
		name: exceptionType,
	};
	const normalized: {
		diagnostic: SafeErrorDiagnostic;
		exceptionType: string;
		message?: string;
		stack?: string;
		responseError?: string;
		exception: typeof normalizedException;
		attributes: TelemetryAttributes;
		fingerprint: string[];
	} = {
		diagnostic,
		exceptionType,
		exception: normalizedException,
		attributes,
		fingerprint: getFingerprint(context.kind, attributes, diagnostic),
	};
	if (message) {
		normalized.message = message;
		normalized.exception.message = message;
	}
	if (stack) {
		normalized.stack = stack;
		normalized.exception.stack = stack;
	}
	if (responseError) normalized.responseError = responseError;
	return normalized as NormalizedFailure;
}

function sanitizeContext(
	value: unknown,
): Record<string, TelemetryAttributeValue> {
	if (!isObject(value)) return {};
	const output: Record<string, TelemetryAttributeValue> = {};
	for (const [key, rawValue] of Object.entries(value).slice(0, 32)) {
		if (
			key !== "kind" &&
			!SAFE_TAG_PREFIXES.some((prefix) => key.startsWith(prefix))
		) {
			continue;
		}
		if (
			!isString(rawValue) &&
			!isNumber(rawValue) &&
			!isBoolean(rawValue)
		) {
			continue;
		}
		if (isNumber(rawValue) && !Number.isFinite(rawValue)) {
			continue;
		}
		output[truncate(key, 128)] = sanitizeAttributeValue(key, rawValue);
	}
	return output;
}

function sanitizeSentryTags(tags: ErrorEvent["tags"]): ErrorEvent["tags"] {
	if (!tags) return undefined;
	const output: NonNullable<ErrorEvent["tags"]> = {};
	for (const [key, value] of Object.entries(tags)) {
		if (!SAFE_TAG_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
		if (
			!isString(value) &&
			!isNumber(value) &&
			!isBoolean(value)
		) {
			continue;
		}
		output[truncate(key, 128)] =
			isString(value)
				? sanitizeDiagnosticText(value, MAX_ATTRIBUTE_LENGTH)
				: value;
	}
	return output;
}

function normalizeStackFilename(value: string): string {
	const sanitized = sanitizeDiagnosticText(value, MAX_ATTRIBUTE_LENGTH);
	const distMarker = sanitized.lastIndexOf("/dist/");
	return distMarker >= 0
		? `~${sanitized.slice(distMarker)}`
		: removeHomePath(sanitized);
}

function sanitizeSentryExceptionValues(
	event: ErrorEvent,
): ErrorEvent["exception"] {
	const values = event.exception?.values;
	if (!values) return undefined;
	return {
		values: values.map((value) => {
			const safeValue: Mutable<SentryExceptionValue> = {};
			if (value.type)
				safeValue.type = sanitizeDiagnosticText(
					value.type,
					MAX_ATTRIBUTE_LENGTH,
				);
			if (value.value)
				safeValue.value = sanitizeDiagnosticText(
					value.value,
					MAX_MESSAGE_LENGTH,
				);
			if (value.stacktrace) {
				safeValue.stacktrace = {
					frames: value.stacktrace.frames?.map((frame) => {
						const safeFrame: Mutable<SentryStackFrame> = {};
						if (frame.filename)
							safeFrame.filename = normalizeStackFilename(frame.filename);
						if (frame.function)
							safeFrame.function = sanitizeDiagnosticText(
								frame.function,
								MAX_ATTRIBUTE_LENGTH,
							);
						if (isNumber(frame.lineno))
							safeFrame.lineno = frame.lineno;
						if (isNumber(frame.colno)) safeFrame.colno = frame.colno;
						if (isBoolean(frame.in_app))
							safeFrame.in_app = frame.in_app;
						return safeFrame;
					}),
				};
			}
			return safeValue;
		}),
	};
}

/** Final Sentry-side safety net for SDK-generated event fields and integrations. */
export function sanitizeSentryEvent(
	event: ErrorEvent,
	_hint?: EventHint,
): ErrorEvent {
	const sanitized: ErrorEvent = {
		...event,
		request: undefined,
		user: undefined,
		server_name: undefined,
		breadcrumbs: undefined,
		extra: undefined,
		logentry: undefined,
		threads: undefined,
		sdkProcessingMetadata: undefined,
		contexts: event.contexts?.mcp
			? { mcp: sanitizeContext(event.contexts.mcp) }
			: undefined,
		tags: sanitizeSentryTags(event.tags),
		exception: sanitizeSentryExceptionValues(event),
		spans: undefined,
	};
	if (event.message)
		sanitized.message = sanitizeDiagnosticText(
			event.message,
			MAX_MESSAGE_LENGTH,
		);
	return sanitized;
}

function createSentryError(record: NormalizedFailure): Error {
	const error = new Error(record.message ?? record.exceptionType);
	error.name = record.exceptionType;
	if (record.stack) error.stack = record.stack;
	return error;
}

function setSpanAttributes(span: Span, attributes: TelemetryAttributes): void {
	try {
		span.setAttributes(attributes);
	} catch {
		// Telemetry must never alter application behavior.
	}
}

const reportedErrors = new WeakSet<object>();
const diagnosticIds = new WeakMap<object, string>();

function getDiagnosticId(error: unknown): string | undefined {
	if (isObject(error)) {
		const existing = diagnosticIds.get(error);
		if (existing) return existing;
	}
	try {
		const generated = randomUUID();
		if (isObject(error)) diagnosticIds.set(error, generated);
		return generated;
	} catch {
		return undefined;
	}
}

function hasReportedError(error: unknown): boolean {
	if (!isObject(error)) return false;
	if (reportedErrors.has(error)) return true;
	reportedErrors.add(error);
	return false;
}

export function captureFailure(
	error: unknown,
	context: FailureContext,
): FailureReceipt | undefined {
	if (!TELEMETRY_ENABLED) return undefined;
	const span = context.span ?? trace.getActiveSpan() ?? undefined;
	const record = normalizeFailure(error, context);
	const traceContext = getTraceContext(span);
	if (traceContext.traceId) {
		record.attributes["otel.trace_id"] = traceContext.traceId;
	}
	if (traceContext.spanId) {
		record.attributes["otel.span_id"] = traceContext.spanId;
	}

	const diagnosticId = getDiagnosticId(error);
	if (diagnosticId) record.attributes["mcp.failure.id"] = diagnosticId;

	const duplicate = context.expected ? false : hasReportedError(error);
	let eventId: string | undefined;
	if (!duplicate && !context.expected) {
		try {
			eventId = Sentry.withScope((scope) => {
				for (const [key, value] of Object.entries(record.attributes)) {
					scope.setTag(key, String(value));
				}
				scope.setFingerprint([...record.fingerprint]);
				const sentryContext: SentryContext = {
					kind: context.kind,
					...record.attributes,
				};
				if (record.responseError)
					sentryContext["hevy.api.response_error"] = record.responseError;
				scope.setContext("mcp", sentryContext);
				return Sentry.captureException(createSentryError(record));
			});
		} catch {
			// Sentry failures must never affect MCP behavior.
		}
	}

	if (span) {
		try {
			if (!duplicate && !context.expected) {
				span.recordException(record.exception);
				if (record.responseError) {
					span.addEvent("mcp.failure.detail", {
						"hevy.api.response_error": record.responseError,
					});
				}
			}
			setSpanAttributes(span, record.attributes);
			if (!context.expected) {
				span.setStatus({ code: SpanStatusCode.ERROR });
			}
			if (eventId) span.setAttribute("sentry.event_id", eventId);
		} catch {
			// OTel failures must never affect MCP behavior.
		}
	}

	const receipt: Mutable<FailureReceipt> = {};
	if (diagnosticId) receipt.diagnosticId = diagnosticId;
	if (eventId) receipt.eventId = eventId;
	if (traceContext.traceId) receipt.traceId = traceContext.traceId;
	if (traceContext.spanId) receipt.spanId = traceContext.spanId;
	return receipt;
}
