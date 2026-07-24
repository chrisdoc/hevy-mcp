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
	readonly transport: "stdio";
}

const UNKNOWN_METADATA = "unknown";
const MAX_METADATA_LENGTH = 64;
const SAFE_METADATA_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+:/@-]{0,63}$/u;

let currentSession:
	| {
			metadata: McpClientMetadata;
			startedAt: number;
			toolCalls: number;
			hadToolFailure: boolean;
	  }
	| undefined;

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

function metadataAttributes(
	metadata: McpClientMetadata,
): McpClientMetricAttributes {
	return {
		client_name: metadata.name,
		client_version: metadata.version,
		protocol_version: metadata.protocolVersion,
		transport: "stdio",
	};
}

function durationBucket(durationMs: number): string {
	if (durationMs < 1_000) return "<1s";
	if (durationMs < 10_000) return "1-10s";
	if (durationMs < 60_000) return "10-60s";
	if (durationMs < 300_000) return "1-5m";
	return "5m+";
}

export function recordMcpSessionStart(message: unknown): McpClientMetadata {
	const metadata = extractMcpClientMetadata(message);
	currentSession = {
		metadata,
		startedAt: Date.now(),
		toolCalls: 0,
		hadToolFailure: false,
	};
	const attributes = metadataAttributes(metadata);
	sessionStarted.add(1, attributes);
	return metadata;
}

export function recordMcpToolInvocation(): McpClientMetricAttributes {
	if (currentSession) currentSession.toolCalls += 1;
	return metadataAttributes(
		currentSession?.metadata ?? {
			name: UNKNOWN_METADATA,
			version: UNKNOWN_METADATA,
			protocolVersion: UNKNOWN_METADATA,
		},
	);
}

export function recordMcpToolFailure(): void {
	if (currentSession) currentSession.hadToolFailure = true;
}

export function getCurrentMcpClientMetadata(): McpClientMetadata {
	return (
		currentSession?.metadata ?? {
			name: UNKNOWN_METADATA,
			version: UNKNOWN_METADATA,
			protocolVersion: UNKNOWN_METADATA,
		}
	);
}

export function recordMcpSessionTermination(
	category: McpSessionTerminationCategory,
): void {
	const session = currentSession;
	const durationMs = session ? Math.max(0, Date.now() - session.startedAt) : 0;
	const metadata = session?.metadata ?? {
		name: UNKNOWN_METADATA,
		version: UNKNOWN_METADATA,
		protocolVersion: UNKNOWN_METADATA,
	};
	const attributes = {
		...metadataAttributes(metadata),
		termination_category: category,
		session_duration_bucket: durationBucket(durationMs),
		tool_calls_bucket: bucketCount(session?.toolCalls ?? 0),
	};
	sessionEnded.add(1, attributes);
	currentSession = undefined;
}

export function resolveSessionTerminationCategory(
	shutdownSucceeded: boolean,
): McpSessionTerminationCategory {
	if (!shutdownSucceeded) return "unknown";
	return currentSession?.hadToolFailure ? "tool_failure" : "clean";
}
