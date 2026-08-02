import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { sessionEnded, sessionStarted } from "./metrics.js";
import { bucketCount } from "./result-telemetry.js";

export const MCP_SESSION_TERMINATION_CATEGORIES = [
	"clean",
	"startup_failure",
	"connect_failure",
	"tool_failure",
	"unknown",
] as const;

export type McpSessionTerminationCategory =
	(typeof MCP_SESSION_TERMINATION_CATEGORIES)[number];
export type McpTransport = "stdio" | "http";

export interface McpClientMetadata {
	readonly name: string;
	readonly version: string;
	readonly protocolVersion: string;
}

export interface McpClientMetricAttributes {
	readonly [key: string]: string;
	readonly client_name: string;
	readonly client_version: string;
	readonly protocol_version: string;
	readonly transport: McpTransport;
}

export interface McpSessionContextOptions {
	readonly telemetrySessionId?: string;
	readonly generateTelemetrySessionId?: () => string;
	readonly now?: () => number;
}

export interface McpSessionContext {
	metadata: McpClientMetadata;
	startedAt: number;
	toolCalls: number;
	hadToolFailure: boolean;
	transport: McpTransport;
	/** Opaque process-local correlation ID; never derived from protocol headers. */
	telemetrySessionId: string;
}

const UNKNOWN_METADATA = "unknown";
const MAX_METADATA_LENGTH = 64;
const SAFE_METADATA_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+:/@-]{0,63}$/u;
const contextStorage = new AsyncLocalStorage<McpSessionContext>();
// Stdio has one process-wide connection and its parser callbacks are not
// attached to an AsyncLocalStorage scope. HTTP never uses this fallback: every
// request is explicitly run with its own session context.
let activeStdioSession: McpSessionContext | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeMetadata(value: unknown): string {
	if (typeof value !== "string") return UNKNOWN_METADATA;
	const normalized = value.trim();
	if (
		normalized.length === 0 ||
		normalized.length > MAX_METADATA_LENGTH ||
		!SAFE_METADATA_PATTERN.test(normalized)
	) {
		return UNKNOWN_METADATA;
	}
	return normalized;
}

function getInitializeParams(message: unknown): Record<string, unknown> {
	if (!isRecord(message) || message.method !== "initialize") return {};
	return isRecord(message.params) ? message.params : {};
}

export function extractMcpClientMetadata(message: unknown): McpClientMetadata {
	const params = getInitializeParams(message);
	const clientInfo = isRecord(params.clientInfo) ? params.clientInfo : {};
	return {
		name: normalizeMetadata(clientInfo.name),
		version: normalizeMetadata(clientInfo.version),
		protocolVersion: normalizeMetadata(params.protocolVersion),
	};
}

export function createMcpSessionContext(
	message: unknown,
	transport: McpTransport = "stdio",
	options: McpSessionContextOptions | (() => string) = {},
): McpSessionContext {
	const normalizedOptions =
		typeof options === "function"
			? { generateTelemetrySessionId: options }
			: options;
	return {
		metadata: extractMcpClientMetadata(message),
		startedAt: (normalizedOptions.now ?? Date.now)(),
		toolCalls: 0,
		hadToolFailure: false,
		transport,
		telemetrySessionId:
			normalizedOptions.telemetrySessionId ??
			(normalizedOptions.generateTelemetrySessionId ?? randomUUID)(),
	};
}

export function runWithMcpSessionContext<T>(
	context: McpSessionContext,
	callback: () => T,
): T {
	return contextStorage.run(context, callback);
}

function getSession(): McpSessionContext | undefined {
	const scopedSession = contextStorage.getStore();
	return scopedSession ?? activeStdioSession;
}

export function getCurrentMcpSessionId(): string | undefined {
	return getSession()?.telemetrySessionId;
}

function metadataAttributes(
	metadata: McpClientMetadata,
	transport: McpTransport,
): McpClientMetricAttributes {
	return {
		client_name: metadata.name,
		client_version: metadata.version,
		protocol_version: metadata.protocolVersion,
		transport,
	};
}

function durationBucket(durationMs: number): string {
	if (durationMs < 1_000) return "<1s";
	if (durationMs < 10_000) return "1-10s";
	if (durationMs < 60_000) return "10-60s";
	if (durationMs < 300_000) return "1-5m";
	return "5m+";
}

export function recordMcpSessionStart(
	message: unknown,
	transport: McpTransport = "stdio",
	context?: McpSessionContext,
): McpClientMetadata {
	const session = context ?? createMcpSessionContext(message, transport);
	if (session.transport === "stdio") activeStdioSession = session;
	const attributes = metadataAttributes(session.metadata, session.transport);
	sessionStarted.add(1, attributes);
	return session.metadata;
}

export function recordMcpToolInvocation(): McpClientMetricAttributes {
	const session = getSession();
	if (session) session.toolCalls += 1;
	return metadataAttributes(
		session?.metadata ?? {
			name: UNKNOWN_METADATA,
			version: UNKNOWN_METADATA,
			protocolVersion: UNKNOWN_METADATA,
		},
		session?.transport ?? "stdio",
	);
}

export function recordMcpToolFailure(): void {
	const session = getSession();
	if (session) session.hadToolFailure = true;
}

export function getCurrentMcpClientMetadata(): McpClientMetadata {
	return (
		getSession()?.metadata ?? {
			name: UNKNOWN_METADATA,
			version: UNKNOWN_METADATA,
			protocolVersion: UNKNOWN_METADATA,
		}
	);
}

export function getCurrentMcpTransport(): McpTransport {
	return getSession()?.transport ?? "stdio";
}

export function recordMcpSessionTermination(
	category: McpSessionTerminationCategory,
	context?: McpSessionContext,
): void {
	const session = context ?? getSession();
	const durationMs = session ? Math.max(0, Date.now() - session.startedAt) : 0;
	const metadata = session?.metadata ?? {
		name: UNKNOWN_METADATA,
		version: UNKNOWN_METADATA,
		protocolVersion: UNKNOWN_METADATA,
	};
	const attributes = {
		...metadataAttributes(metadata, session?.transport ?? "stdio"),
		termination_category: category,
		session_duration_bucket: durationBucket(durationMs),
		tool_calls_bucket: bucketCount(session?.toolCalls ?? 0),
	};
	sessionEnded.add(1, attributes);
	if (!context || context === activeStdioSession)
		activeStdioSession = undefined;
}

export function resolveSessionTerminationCategory(
	shutdownSucceeded: boolean,
	context?: McpSessionContext,
): McpSessionTerminationCategory {
	if (!shutdownSucceeded) return "unknown";
	return (context ?? getSession())?.hadToolFailure ? "tool_failure" : "clean";
}
