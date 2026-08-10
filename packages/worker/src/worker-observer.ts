import { tracing } from "cloudflare:workers";
import {
	createExecutionProjection,
	createSafeErrorDiagnostic,
	type SafeToolCompletion,
	type SafeToolInvocation,
	type StructuredExecutionProjection,
	type ToolObservationScope,
	type ToolObserver,
	type ToolResultObservation,
	type ToolResultTelemetry,
} from "@hevy-mcp/core";

const MAX_NAME_LENGTH = 96;
const MAX_STRING_LENGTH = 160;
const MAX_ARGUMENT_KEYS = 32;
const MAX_WORKFLOW_PAGES = 10_000;
const MAX_WORKFLOW_ITEMS = 1_000_000;
const SAFE_USER_HASH_PATTERN = /^[0-9a-f]{10}$/u;
const SAFE_CLOUDFLARE_COLO_PATTERN = /^[A-Z]{3}$/u;

const SAFE_ARGUMENT_KEYS = new Set([
	"date",
	"end_date",
	"exercise_template_id",
	"folder_id",
	"include_custom",
	"limit",
	"offset",
	"page",
	"page_size",
	"primary_muscle_group",
	"query",
	"refresh",
	"routine_id",
	"since",
	"start_date",
	"updated_since",
	"workout_id",
]);
const SAFE_COUNT_BUCKETS = new Set(["0", "1", "2-10", "11-50", "51+"]);
const SAFE_WORKFLOW_NAMES = new Set(["training-summary", "routine-discovery"]);
const SAFE_CACHE_STATUSES = new Set(["hit", "miss", "not-used"]);
const SAFE_ERROR_TYPES = new Set([
	"API_ERROR",
	"RATE_LIMIT",
	"VALIDATION_ERROR",
	"NOT_FOUND",
	"NETWORK_ERROR",
	"UNKNOWN_ERROR",
]);
const SAFE_ERROR_CATEGORIES = new Set([
	"AggregateError",
	"DOMException",
	"Error",
	"EvalError",
	"HevyHttpError",
	"RangeError",
	"ReferenceError",
	"SyntaxError",
	"TypeError",
	"URIError",
	"UnknownError",
]);
const SAFE_ERROR_CODES = new Set([
	"EAI_AGAIN",
	"ECONNABORTED",
	"ECONNREFUSED",
	"ECONNRESET",
	"ENETUNREACH",
	"ENOTFOUND",
	"ERR_NETWORK",
	"ERR_SOCKET_TIMEOUT",
	"ETIMEDOUT",
	"HEVY_INVALID_ENDPOINT",
	"HEVY_REQUEST_ABORTED",
	"HEVY_RETRY_EXHAUSTED",
	"HEVY_DEADLINE_EXCEEDED",
]);
const SAFE_HTTP_METHODS = new Set([
	"DELETE",
	"GET",
	"HEAD",
	"OPTIONS",
	"PATCH",
	"POST",
	"PUT",
]);
const SAFE_ENDPOINTS = new Set([
	"/v1/body_measurements",
	"/v1/body_measurements/:date",
	"/v1/exercise_history/:exerciseTemplateId",
	"/v1/exercise_templates",
	"/v1/exercise_templates/:exerciseTemplateId",
	"/v1/routine_folders",
	"/v1/routine_folders/:folderId",
	"/v1/routines",
	"/v1/routines/:routineId",
	"/v1/user/info",
	"/v1/workouts",
	"/v1/workouts/:workoutId",
	"/v1/workouts/count",
	"/v1/workouts/events",
]);
const SAFE_EXECUTION_OUTCOMES = new Set([
	"success",
	"expected",
	"retryable_failure",
	"terminal_failure",
	"cancelled",
	"deadline_exceeded",
]);
const SAFE_REQUEST_PHASES = new Set([
	"before-dispatch",
	"dispatch",
	"response-headers",
	"response-content",
	"backoff",
	"completed",
]);
const SAFE_OPERATION_SAFETY = new Set([
	"read",
	"idempotent-write",
	"non-idempotent-write",
]);
const SAFE_COMMIT_STATES = new Set(["not_sent", "confirmed", "unknown"]);
const SAFE_STACK_SOURCES = new Set([
	"error-handler",
	"hevy-client",
	"index",
	"server",
	"worker",
]);

/** Structured events emitted by the Worker adapter's private observation sink. */
export interface WorkerObservationEvent {
	readonly event: "worker.tool.invocation" | "worker.tool.completion";
	readonly name: string;
	readonly kind: "tool" | "prompt";
	readonly taxonomy?: {
		readonly feature: string;
		readonly kind: string;
		readonly operation: string;
	};
	readonly argumentKeys?: readonly string[];
	readonly argumentPresence?: Readonly<Record<string, true>>;
	readonly numericArgumentBuckets?: Readonly<Record<string, string>>;
	readonly booleanArguments?: Readonly<Record<string, boolean>>;
	readonly argumentKeyCountBucket?: string;
	readonly outcome?: SafeToolCompletion["outcome"];
	readonly durationMs?: number;
	readonly result?: WorkerResultObservation;
	readonly errorType?: string;
	readonly error?: ReturnType<typeof createSafeErrorDiagnostic>;
	readonly execution?: ReturnType<typeof createExecutionProjection>;
}

interface WorkerResultObservation {
	readonly isError: boolean;
	readonly hasStructuredContent: boolean;
	readonly contentCountBucket: string;
	readonly summary?: SafeResultSummary;
}

interface SafeResultSummary {
	readonly itemCountBucket?: string;
	readonly exerciseCountBucket?: string;
	readonly setCountBucket?: string;
	readonly workflow?: {
		readonly name: string;
		readonly pagination: Readonly<Record<string, number>>;
		readonly cacheStatus: string;
		readonly itemsScanned: number;
	};
}

export type WorkerObservationSink = (
	event: WorkerObservationEvent,
) => void | Promise<void>;

export interface WorkerTraceSpan {
	setAttribute(key: string, value: string | number | boolean | undefined): void;
	end(): void;
}

export interface WorkerTracing {
	startActiveSpan<T>(name: string, callback: (span: WorkerTraceSpan) => T): T;
}

export interface WorkerToolObserverOptions {
	/** Defaults to console.log; test callers can provide an isolated sink. */
	readonly sink?: WorkerObservationSink;
	/** HMAC pseudonym derived from the request's Hevy API key. */
	readonly userHash?: string;
	/** Cloudflare's three-letter edge colo, when the request has one. */
	readonly cloudflareColo?: string;
	/** Injectable for unit tests; production uses Cloudflare's tracing API. */
	readonly tracing?: WorkerTracing;
}

function boundedString(
	value: unknown,
	maxLength = MAX_STRING_LENGTH,
): string | undefined {
	if (typeof value !== "string" || value.length === 0) return undefined;
	return value.slice(0, maxLength);
}

function safeName(value: unknown): string {
	return boundedString(value, MAX_NAME_LENGTH) ?? "unknown";
}

function safeUserHash(value: unknown): string | undefined {
	return typeof value === "string" && SAFE_USER_HASH_PATTERN.test(value)
		? value
		: undefined;
}

function safeCloudflareColo(value: unknown): string | undefined {
	return typeof value === "string" && SAFE_CLOUDFLARE_COLO_PATTERN.test(value)
		? value
		: undefined;
}

function safeBucket(value: unknown): string | undefined {
	return typeof value === "string" && SAFE_COUNT_BUCKETS.has(value)
		? value
		: undefined;
}

function safeTaxonomy(
	invocation: SafeToolInvocation,
): WorkerObservationEvent["taxonomy"] {
	const taxonomy = invocation.taxonomy;
	if (!taxonomy) return undefined;
	const feature = boundedString(taxonomy.feature, MAX_NAME_LENGTH);
	const kind = boundedString(taxonomy.kind, MAX_NAME_LENGTH);
	const operation = boundedString(taxonomy.operation, MAX_NAME_LENGTH);
	return feature && kind && operation
		? { feature, kind, operation }
		: undefined;
}

function safeInvocation(
	invocation: SafeToolInvocation,
): Omit<WorkerObservationEvent, "event"> {
	const argumentKeys = (invocation.argumentKeys ?? [])
		.filter((key) => SAFE_ARGUMENT_KEYS.has(key))
		.slice(0, MAX_ARGUMENT_KEYS);
	const argumentPresence: Record<string, true> = {};
	for (const key of Object.keys(invocation.argumentPresence ?? {})) {
		if (SAFE_ARGUMENT_KEYS.has(key)) argumentPresence[key] = true;
	}
	const numericArgumentBuckets: Record<string, string> = {};
	for (const [key, value] of Object.entries(
		invocation.numericArgumentBuckets ?? {},
	)) {
		const bucket = safeBucket(value);
		if (SAFE_ARGUMENT_KEYS.has(key) && bucket)
			numericArgumentBuckets[key] = bucket;
	}
	const booleanArguments: Record<string, boolean> = {};
	for (const [key, value] of Object.entries(
		invocation.booleanArguments ?? {},
	)) {
		if (SAFE_ARGUMENT_KEYS.has(key) && typeof value === "boolean") {
			booleanArguments[key] = value;
		}
	}
	const keyCountBucket = safeBucket(invocation.argumentKeyCountBucket);
	return {
		name: safeName(invocation.name),
		kind: invocation.kind === "prompt" ? "prompt" : "tool",
		...(safeTaxonomy(invocation) ? { taxonomy: safeTaxonomy(invocation) } : {}),
		...(argumentKeys.length ? { argumentKeys } : {}),
		...(Object.keys(argumentPresence).length ? { argumentPresence } : {}),
		...(Object.keys(numericArgumentBuckets).length
			? { numericArgumentBuckets }
			: {}),
		...(Object.keys(booleanArguments).length ? { booleanArguments } : {}),
		...(keyCountBucket ? { argumentKeyCountBucket: keyCountBucket } : {}),
	};
}

function boundedCount(value: unknown, maximum: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0;
	return Math.min(maximum, Math.max(0, Math.floor(value)));
}

function safeSummary(
	summary: ToolResultTelemetry | undefined,
): SafeResultSummary | undefined {
	if (!summary) return undefined;
	const itemCountBucket = safeBucket(summary.itemCountBucket);
	const exerciseCountBucket = safeBucket(summary.exerciseCountBucket);
	const setCountBucket = safeBucket(summary.setCountBucket);
	const workflow = summary.workflow;
	const safeWorkflow =
		workflow && SAFE_WORKFLOW_NAMES.has(workflow.name)
			? {
					name: workflow.name,
					cacheStatus: SAFE_CACHE_STATUSES.has(workflow.cacheStatus)
						? workflow.cacheStatus
						: "not-used",
					itemsScanned: boundedCount(workflow.itemsScanned, MAX_WORKFLOW_ITEMS),
					pagination: Object.fromEntries(
						Object.entries(workflow.pagination)
							.filter(([resource]) =>
								["workouts", "bodyMeasurements", "routines"].includes(resource),
							)
							.slice(0, MAX_ARGUMENT_KEYS)
							.map(([resource, pages]) => [
								resource,
								boundedCount(pages, MAX_WORKFLOW_PAGES),
							]),
					),
				}
			: undefined;
	if (
		!itemCountBucket &&
		!exerciseCountBucket &&
		!setCountBucket &&
		!safeWorkflow
	) {
		return undefined;
	}
	return {
		...(itemCountBucket ? { itemCountBucket } : {}),
		...(exerciseCountBucket ? { exerciseCountBucket } : {}),
		...(setCountBucket ? { setCountBucket } : {}),
		...(safeWorkflow ? { workflow: safeWorkflow } : {}),
	};
}

function safeResult(
	result: ToolResultObservation | undefined,
): WorkerResultObservation | undefined {
	if (!result) return undefined;
	return {
		isError: result.isError === true,
		hasStructuredContent: result.hasStructuredContent === true,
		contentCountBucket: safeBucket(result.contentCountBucket) ?? "0",
		...(safeSummary(result.summary)
			? { summary: safeSummary(result.summary) }
			: {}),
	};
}

type SafeErrorOutput = ReturnType<typeof createSafeErrorDiagnostic>;

function safeErrorStatus(value: unknown): number | undefined {
	if (typeof value !== "number") return undefined;
	return Number.isInteger(value) && value >= 100 && value <= 599
		? value
		: undefined;
}

function safeErrorMethod(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const method = value.toUpperCase();
	return SAFE_HTTP_METHODS.has(method) ? method : undefined;
}

function safeErrorFrames(
	frames: SafeErrorOutput["frames"],
): SafeErrorOutput["frames"] {
	return frames
		?.filter(
			(frame) =>
				SAFE_STACK_SOURCES.has(frame.source) &&
				Number.isSafeInteger(frame.line) &&
				Number.isSafeInteger(frame.column) &&
				frame.line > 0 &&
				frame.column > 0,
		)
		.slice(0, 3);
}

function safeErrorBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function safeError(
	error: ReturnType<typeof createSafeErrorDiagnostic> | undefined,
): ReturnType<typeof createSafeErrorDiagnostic> | undefined {
	if (!error || typeof error !== "object") return undefined;
	const category =
		allowedValue<SafeErrorOutput["category"]>(
			error.category,
			SAFE_ERROR_CATEGORIES,
		) ?? "UnknownError";
	const code = allowedValue<string>(error.code, SAFE_ERROR_CODES);
	const method = safeErrorMethod(error.method);
	const endpoint = allowedValue<string>(error.endpoint, SAFE_ENDPOINTS);
	const frames = safeErrorFrames(error.frames);
	const phase = allowedValue<NonNullable<SafeErrorOutput["phase"]>>(
		error.phase,
		SAFE_REQUEST_PHASES,
	);
	const operationSafety = allowedValue<
		NonNullable<SafeErrorOutput["operation_safety"]>
	>(error.operation_safety, SAFE_OPERATION_SAFETY);
	const commitState = allowedValue<
		NonNullable<SafeErrorOutput["commit_state"]>
	>(error.commit_state, SAFE_COMMIT_STATES);
	const outcome = allowedValue<NonNullable<SafeErrorOutput["outcome"]>>(
		error.outcome,
		SAFE_EXECUTION_OUTCOMES,
	);
	const status = safeErrorStatus(error.status);
	const safeToRetry = safeErrorBoolean(error.safe_to_retry);
	const sanitized: SafeErrorOutput = { category };
	if (code !== undefined) sanitized.code = code;
	if (status !== undefined) sanitized.status = status;
	if (method !== undefined) sanitized.method = method;
	if (endpoint !== undefined) sanitized.endpoint = endpoint;
	if (frames?.length) sanitized.frames = frames;
	if (phase !== undefined) sanitized.phase = phase;
	if (operationSafety !== undefined)
		sanitized.operation_safety = operationSafety;
	if (commitState !== undefined) sanitized.commit_state = commitState;
	if (safeToRetry !== undefined) sanitized.safe_to_retry = safeToRetry;
	if (outcome !== undefined) sanitized.outcome = outcome;
	return sanitized;
}

type SafeExecutionSource = Partial<
	Pick<
		StructuredExecutionProjection,
		| "outcome"
		| "phase"
		| "operation_safety"
		| "commit_state"
		| "safe_to_retry"
		| "code"
		| "status"
	>
>;

function allowedValue<T extends string>(
	value: unknown,
	allowed: ReadonlySet<string>,
): T | undefined {
	return typeof value === "string" && allowed.has(value)
		? (value as T)
		: undefined;
}

function safeExecution(
	source: SafeExecutionSource | undefined,
): ReturnType<typeof createExecutionProjection> | undefined {
	if (!source) return undefined;
	return createExecutionProjection({
		outcome: allowedValue(source.outcome, SAFE_EXECUTION_OUTCOMES),
		phase: allowedValue(source.phase, SAFE_REQUEST_PHASES),
		operation_safety: allowedValue(
			source.operation_safety,
			SAFE_OPERATION_SAFETY,
		),
		commit_state: allowedValue(source.commit_state, SAFE_COMMIT_STATES),
		safe_to_retry:
			typeof source.safe_to_retry === "boolean"
				? source.safe_to_retry
				: undefined,
		code:
			typeof source.code === "string" && SAFE_ERROR_CODES.has(source.code)
				? source.code
				: undefined,
		status:
			typeof source.status === "number" &&
			Number.isInteger(source.status) &&
			source.status >= 100 &&
			source.status <= 599
				? source.status
				: undefined,
	});
}

function emitBestEffort(
	sink: WorkerObservationSink,
	event: WorkerObservationEvent,
): void {
	try {
		const pending = sink(event);
		if (pending) Promise.resolve(pending).catch(() => undefined);
	} catch {
		// Worker observation is strictly best effort and must not affect MCP behavior.
	}
}

function setSpanAttributes(
	span: WorkerTraceSpan,
	attributes: Readonly<Record<string, string | number | boolean>>,
): void {
	for (const [key, value] of Object.entries(attributes)) {
		try {
			span.setAttribute(key, value);
		} catch {
			// Trace enrichment must never affect MCP behavior.
		}
	}
}

function finishSpan(
	span: WorkerTraceSpan,
	outcome: SafeToolCompletion["outcome"],
): void {
	try {
		span.setAttribute("mcp.tool.outcome", outcome);
	} catch {
		// Trace enrichment must never affect MCP behavior.
	}
	try {
		span.end();
	} catch {
		// Trace enrichment must never affect MCP behavior.
	}
}

/** Worker-only adapter for Core's privacy-safe semantic observation contract. */
export function createWorkerToolObserver(
	options: WorkerToolObserverOptions = {},
): ToolObserver {
	const sink =
		options.sink ?? ((event: WorkerObservationEvent) => console.log(event));
	const workerTracing = options.tracing ?? tracing;
	const userHash = safeUserHash(options.userHash);
	const cloudflareColo = safeCloudflareColo(options.cloudflareColo);
	return {
		start(invocation): ToolObservationScope {
			let safe: Omit<WorkerObservationEvent, "event">;
			try {
				safe = safeInvocation(invocation);
			} catch {
				safe = { name: "unknown", kind: "tool" };
			}
			const startedAt = Date.now();
			emitBestEffort(sink, { event: "worker.tool.invocation", ...safe });
			let finished = false;
			let activeSpan: WorkerTraceSpan | undefined;
			return {
				run<T>(operation: () => Promise<T>): Promise<T> {
					if (activeSpan) return operation();
					let callbackEntered = false;
					try {
						return workerTracing.startActiveSpan(
							`mcp.${safe.kind}.${safe.name}`,
							(span) => {
								callbackEntered = true;
								activeSpan = span;
								setSpanAttributes(span, {
									"mcp.span.category": safe.kind,
									"mcp.operation.kind": safe.kind,
									[safe.kind === "prompt"
										? "mcp.prompt.name"
										: "mcp.tool.name"]: safe.name,
									...(userHash ? { "user.hash": userHash } : {}),
									...(cloudflareColo
										? { "cloudflare.colo": cloudflareColo }
										: {}),
								});
								return operation();
							},
						);
					} catch (error) {
						// If the callback ran, its error belongs to the operation and the
						// core runtime will call finish. Only bypass a failed tracing API
						// before callback entry.
						if (callbackEntered) throw error;
						return operation();
					}
				},
				finish(completion) {
					if (finished) return;
					finished = true;
					if (activeSpan) {
						finishSpan(activeSpan, completion.outcome);
						activeSpan = undefined;
					}
					try {
						const durationMs = boundedCount(
							completion.durationMs || Date.now() - startedAt,
							Number.MAX_SAFE_INTEGER,
						);
						const error = safeError(completion.error);
						const execution = completion.errorOutcome
							? safeExecution(completion.errorOutcome)
							: safeExecution(error);
						const result = safeResult(completion.result);
						emitBestEffort(sink, {
							event: "worker.tool.completion",
							...safe,
							outcome: completion.outcome,
							durationMs,
							...(result ? { result } : {}),
							...(SAFE_ERROR_TYPES.has(completion.errorType ?? "")
								? { errorType: completion.errorType }
								: {}),
							...(error ? { error } : {}),
							...(execution ? { execution } : {}),
						});
					} catch {
						// Observation projection is best effort and must not affect MCP behavior.
					}
				},
			};
		},
	};
}
