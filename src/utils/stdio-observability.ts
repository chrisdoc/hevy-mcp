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
	const mutableTransport = transport as unknown as MutableStdioServerTransport;
	let lastChunkSnapshot: StdioChunkSnapshot = {
		lastChunkByteLength: 0,
		lastChunkStartsWithUtf8Bom: false,
	};

	const originalOnData = mutableTransport._ondata;
	if (typeof originalOnData === "function") {
		mutableTransport._ondata = (chunk: Buffer) => {
			lastChunkSnapshot = {
				lastChunkByteLength: chunk.byteLength,
				lastChunkStartsWithUtf8Bom: hasUtf8BomPrefix(chunk),
			};
			originalOnData(chunk);
		};
	}

	const readBuffer = mutableTransport._readBuffer;
	if (!readBuffer || typeof readBuffer.readMessage !== "function") {
		return transport;
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
		return deserializeMessageWithObservability(line, lastChunkSnapshot);
	};

	return transport;
}
