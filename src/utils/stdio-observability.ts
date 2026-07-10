import { SpanStatusCode } from "@opentelemetry/api";
import type { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { deserializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { Sentry, tracer } from "./telemetry.js";
import { stdioParseErrors } from "./metrics.js";

const UTF8_BOM = "\uFEFF";
/** Maximum escaped characters included in a malformed stdin shape preview. */
const STDIN_PARSE_SHAPE_PREVIEW_MAX_LENGTH = 200;
const REDACTED_CONTENT_MARKER = "[REDACTED]";

export interface StdioChunkSnapshot {
	lastChunkByteLength: number;
	lastChunkStartsWithUtf8Bom: boolean;
}

interface MutableReadBuffer {
	_buffer?: Buffer;
	readMessage: () => JSONRPCMessage | null;
}

type MutableStdioServerTransport = {
	_readBuffer?: MutableReadBuffer;
	_ondata?: (chunk: Buffer) => void;
};

interface SdkPrivateStdioAdapter {
	wrapOnData: (onChunk: (chunk: Buffer) => void) => void;
	installReadMessageHook: (
		onReadLine: (line: string) => JSONRPCMessage,
	) => boolean;
}

/**
 * Adapter boundary around MCP SDK stdio internals.
 *
 * MCP SDK v1.29.0 exposes public message-level hooks but does not expose a
 * public raw-chunk hook on `StdioServerTransport`. To capture chunk metadata,
 * we currently rely on private internals (`_ondata`, `_readBuffer`, `_buffer`)
 * in this one place.
 *
 * If those internals change in a future SDK release, this adapter should fail
 * closed and preserve default transport behavior (no instrumentation patching).
 */
function createSdkPrivateStdioAdapter(
	transport: StdioServerTransport,
): SdkPrivateStdioAdapter {
	const mutableTransport = transport as unknown as MutableStdioServerTransport;

	return {
		wrapOnData(onChunk) {
			const originalOnData = mutableTransport._ondata;
			if (typeof originalOnData !== "function") {
				return;
			}

			mutableTransport._ondata = (chunk: Buffer) => {
				onChunk(chunk);
				originalOnData(chunk);
			};
		},
		installReadMessageHook(onReadLine) {
			const readBuffer = mutableTransport._readBuffer;
			if (!readBuffer || typeof readBuffer.readMessage !== "function") {
				return false;
			}

			readBuffer.readMessage = () => {
				const buffer = readBuffer._buffer;
				if (!buffer) {
					return null;
				}

				const index = buffer.indexOf("\n");
				if (index === -1) {
					return null;
				}

				const lineBuffer = buffer.subarray(0, index);
				readBuffer._buffer = buffer.subarray(index + 1);
				const line = lineBuffer.toString("utf8").replace(/\r$/, "");
				return onReadLine(line);
			};

			return true;
		},
	};
}

function hasUtf8BomPrefix(chunk: Buffer): boolean {
	return (
		chunk.length >= 3 &&
		chunk[0] === 0xef &&
		chunk[1] === 0xbb &&
		chunk[2] === 0xbf
	);
}

function parseFailurePosition(error: unknown): number | null {
	if (!(error instanceof Error)) {
		return null;
	}

	const match = error.message.match(/position\s+(\d+)/i);
	if (!match || !match[1]) {
		return null;
	}

	const position = Number.parseInt(match[1], 10);
	return Number.isFinite(position) ? position : null;
}

function getFailureLocation(
	failurePosition: number | null,
	lineHadLeadingBom: boolean,
): string {
	if (lineHadLeadingBom) {
		return "line_start_bom";
	}
	if (failurePosition === 0) {
		return "line_start";
	}
	if (failurePosition !== null) {
		return "line_body";
	}
	return "unknown";
}

function createStructuralShapePreview(line: string): {
	shapePreview: string;
	truncated: boolean;
} {
	let shapePreview = "";
	let inContentRun = false;
	let inWhitespaceRun = false;

	const append = (token: string): boolean => {
		if (
			shapePreview.length + token.length >
			STDIN_PARSE_SHAPE_PREVIEW_MAX_LENGTH
		) {
			return false;
		}

		shapePreview += token;
		return true;
	};

	for (const character of line) {
		if ('{}[]:,"'.includes(character)) {
			inContentRun = false;
			inWhitespaceRun = false;
			if (!append(character === '"' ? '\\"' : character)) {
				return { shapePreview, truncated: true };
			}
			continue;
		}

		if (/\s/u.test(character)) {
			inContentRun = false;
			if (!inWhitespaceRun) {
				if (!append("\\s")) {
					return { shapePreview, truncated: true };
				}
				inWhitespaceRun = true;
			}
			continue;
		}

		inWhitespaceRun = false;
		if (!inContentRun) {
			if (!append(REDACTED_CONTENT_MARKER)) {
				return { shapePreview, truncated: true };
			}
			inContentRun = true;
		}
	}

	return {
		shapePreview,
		truncated: false,
	};
}

function getSafeErrorKind(
	error: unknown,
): "SyntaxError" | "Error" | "UnknownError" {
	if (error instanceof SyntaxError) {
		return "SyntaxError";
	}
	if (error instanceof Error) {
		return "Error";
	}
	return "UnknownError";
}

function reportStdinParseFailure(
	error: unknown,
	line: string,
	lineByteLength: number,
	failureLocation: string,
	failurePosition: number | null,
): void {
	try {
		const errorKind = getSafeErrorKind(error);
		const { shapePreview, truncated } = createStructuralShapePreview(line);
		const position = failurePosition === null ? "unknown" : failurePosition;

		console.error(
			`Failed to parse MCP stdin message: error_kind=${errorKind} line_bytes=${lineByteLength} failure_location=${failureLocation} failure_position=${position} shape_preview="${shapePreview}" shape_preview_redacted=true shape_preview_truncated=${truncated}`,
		);
	} catch {
		// Diagnostics are best-effort and must not replace the parser error.
	}
}

export function deserializeMessageWithObservability(
	line: string,
	chunkSnapshot: StdioChunkSnapshot,
): JSONRPCMessage {
	const lineHadLeadingBom = line.startsWith(UTF8_BOM);
	const normalizedLine = lineHadLeadingBom ? line.slice(1) : line;
	const lineByteLength = Buffer.byteLength(line);

	return tracer.startActiveSpan(
		"mcp.stdio.deserialize",
		{
			attributes: {
				"mcp.transport": "stdio",
				"mcp.stdio.parse.line.char_length": line.length,
				"mcp.stdio.parse.line.byte_length": lineByteLength,
				"mcp.stdio.parse.line.had_leading_bom": lineHadLeadingBom,
				"mcp.stdio.parse.line.bom_stripped": lineHadLeadingBom,
				"mcp.stdio.parse.chunk.last_byte_length":
					chunkSnapshot.lastChunkByteLength,
				"mcp.stdio.parse.chunk.last_had_utf8_bom":
					chunkSnapshot.lastChunkStartsWithUtf8Bom,
			},
		},
		(span) => {
			try {
				const message = deserializeMessage(normalizedLine);
				span.setStatus({ code: SpanStatusCode.OK });
				if (message && typeof message === "object" && "method" in message) {
					span.setAttribute(
						"mcp.method",
						String((message as { method: unknown }).method),
					);
				}
				return message;
			} catch (error) {
				const failurePosition = parseFailurePosition(error);
				const failureLocation = getFailureLocation(
					failurePosition,
					lineHadLeadingBom,
				);

				span.setStatus({ code: SpanStatusCode.ERROR });
				span.recordException(error as Error);
				span.setAttribute("mcp.stdio.parse.failure.location", failureLocation);
				if (failurePosition !== null) {
					span.setAttribute(
						"mcp.stdio.parse.failure.position",
						failurePosition,
					);
				}

				stdioParseErrors.add(1, { failure_location: failureLocation });

				Sentry.withScope((scope) => {
					scope.setTag("mcp.transport", "stdio");
					scope.setTag("mcp.stdio.parse.failure.location", failureLocation);
					scope.setContext("mcpStdioParse", {
						lineCharLength: line.length,
						lineByteLength,
						lineHadLeadingBom,
						bomStripped: lineHadLeadingBom,
						lastChunkByteLength: chunkSnapshot.lastChunkByteLength,
						lastChunkStartsWithUtf8Bom:
							chunkSnapshot.lastChunkStartsWithUtf8Bom,
						failureLocation,
						failurePosition,
						failureStage: "deserializeMessage",
						errorName: error instanceof Error ? error.name : "UnknownError",
					});
					Sentry.captureException(error);
				});

				reportStdinParseFailure(
					error,
					line,
					lineByteLength,
					failureLocation,
					failurePosition,
				);

				throw error;
			} finally {
				span.end();
			}
		},
	);
}

export function createInstrumentedStdioTransport<
	T extends StdioServerTransport,
>(transport: T): T {
	const privateAdapter = createSdkPrivateStdioAdapter(transport);
	let lastChunkSnapshot: StdioChunkSnapshot = {
		lastChunkByteLength: 0,
		lastChunkStartsWithUtf8Bom: false,
	};

	privateAdapter.wrapOnData((chunk) => {
		lastChunkSnapshot = {
			lastChunkByteLength: chunk.byteLength,
			lastChunkStartsWithUtf8Bom: hasUtf8BomPrefix(chunk),
		};
	});

	const didInstallReadMessageHook = privateAdapter.installReadMessageHook(
		(line) => deserializeMessageWithObservability(line, lastChunkSnapshot),
	);
	if (!didInstallReadMessageHook) {
		return transport;
	}

	return transport;
}
