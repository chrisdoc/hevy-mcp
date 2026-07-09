import * as Sentry from "@sentry/node";
import type { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { deserializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

const UTF8_BOM = "\uFEFF";

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

export function deserializeMessageWithObservability(
	line: string,
	chunkSnapshot: StdioChunkSnapshot,
): JSONRPCMessage {
	const lineHadLeadingBom = line.startsWith(UTF8_BOM);
	const normalizedLine = lineHadLeadingBom ? line.slice(1) : line;
	const lineByteLength = Buffer.byteLength(line);

	return Sentry.startSpan(
		{
			name: "mcp.stdio.deserialize",
			op: "mcp.stdio.parse",
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
				span.setStatus({ code: 1 });
				return message;
			} catch (error) {
				const failurePosition = parseFailurePosition(error);
				const failureLocation = getFailureLocation(
					failurePosition,
					lineHadLeadingBom,
				);

				span.setStatus({ code: 2, message: "invalid_json" });
				span.setAttribute("mcp.stdio.parse.failure.location", failureLocation);
				if (failurePosition !== null) {
					span.setAttribute(
						"mcp.stdio.parse.failure.position",
						failurePosition,
					);
				}

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

				throw error;
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
