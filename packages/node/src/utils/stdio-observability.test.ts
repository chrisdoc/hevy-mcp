import { PassThrough, Writable } from "node:stream";
import * as ServerPackage from "@modelcontextprotocol/server";
import type { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	deserializeMessageWithObservability,
	createInstrumentedStdioTransport,
} from "./stdio-observability.js";

const testDoubles = vi.hoisted(() => ({
	span: {
		setAttribute: vi.fn(),
		setStatus: vi.fn(),
		addEvent: vi.fn(),
		end: vi.fn(),
	},
	startActiveSpan: vi.fn((...args: unknown[]) => {
		const callback = args.at(-1) as (span: unknown) => unknown;
		return callback(testDoubles.span);
	}),
	parseErrors: { add: vi.fn() },
	currentSessionId: undefined as string | undefined,
	recordSessionStart: vi.fn(() => {
		testDoubles.currentSessionId = "session-from-initialize";
		return {
			name: "test-client",
			version: "1.0.0",
			protocolVersion: "2025-11-25",
		};
	}),
}));

const sdkSharedTestDoubles = vi.hoisted(() => ({
	deserializeMessage: vi.fn(),
}));

vi.mock("@modelcontextprotocol/server", async () => {
	const actual = await vi.importActual<typeof ServerPackage>(
		"@modelcontextprotocol/server",
	);

	sdkSharedTestDoubles.deserializeMessage.mockImplementation(
		actual.deserializeMessage,
	);

	return {
		...actual,
		deserializeMessage: sdkSharedTestDoubles.deserializeMessage,
	};
});

vi.mock("./telemetry.js", () => ({
	tracer: { startActiveSpan: testDoubles.startActiveSpan },
}));

vi.mock("./metrics.js", () => ({
	stdioParseErrors: testDoubles.parseErrors,
}));
vi.mock("./mcp-session-observability.js", () => ({
	getCurrentMcpSessionId: vi.fn(() => testDoubles.currentSessionId),
	recordMcpSessionStart: testDoubles.recordSessionStart,
}));

interface ReadBufferDouble {
	_buffer?: Buffer;
	readMessage: () => unknown;
}

function createTransportDouble() {
	const readBuffer: ReadBufferDouble = {
		_buffer: undefined,
		readMessage: () => null,
	};
	const originalOnData = vi.fn((chunk: Buffer) => {
		readBuffer._buffer = readBuffer._buffer
			? Buffer.concat([readBuffer._buffer, chunk])
			: chunk;
	});

	return {
		readBuffer,
		originalOnData,
		transport: {
			_readBuffer: readBuffer,
			_ondata: originalOnData,
		},
	};
}

function extractShapePreview(diagnostic: string): string {
	const prefix = ' shape_preview="';
	const suffix = '" shape_preview_redacted=';
	const start = diagnostic.indexOf(prefix);
	const end = diagnostic.indexOf(suffix, start + prefix.length);

	expect(start).toBeGreaterThanOrEqual(0);
	expect(end).toBeGreaterThanOrEqual(start + prefix.length);

	return diagnostic.slice(start + prefix.length, end);
}

describe("package-local stdio observability", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		testDoubles.currentSessionId = undefined;
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("parses a BOM-prefixed MCP message and records bounded metadata", () => {
		const message = deserializeMessageWithObservability(
			'\uFEFF{"jsonrpc":"2.0","id":1,"method":"ping"}',
			{ lastChunkByteLength: 64, lastChunkStartsWithUtf8Bom: true },
		);

		expect(message).toMatchObject({
			jsonrpc: "2.0",
			id: 1,
			method: "ping",
		});
		expect(testDoubles.startActiveSpan).toHaveBeenCalledWith(
			"mcp.stdio.deserialize",
			expect.any(Object),
			expect.any(Function),
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.method",
			"ping",
		);
	});
	it("records the generated session ID on the initialize span", () => {
		deserializeMessageWithObservability(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
			}),
			{ lastChunkByteLength: 64, lastChunkStartsWithUtf8Bom: false },
		);

		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.session.id",
			"session-from-initialize",
		);
	});

	it("records only sanitized initialize metadata", () => {
		deserializeMessageWithObservability(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-11-25",
					clientInfo: { name: "test-client", version: "1.2.3" },
					privatePrompt: "private-prompt-sentinel",
				},
			}),
			{ lastChunkByteLength: 128, lastChunkStartsWithUtf8Bom: false },
		);

		expect(testDoubles.recordSessionStart).toHaveBeenCalledOnce();
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.client.name",
			"test-client",
		);
		expect(
			JSON.stringify(testDoubles.span.setAttribute.mock.calls),
		).not.toContain("private-prompt-sentinel");
	});

	it("keeps malformed input diagnostics bounded and rethrows the parser error", () => {
		const line = '{"jsonrpc":"2.0","method":"tools/call",';

		expect(() =>
			deserializeMessageWithObservability(line, {
				lastChunkByteLength: line.length,
				lastChunkStartsWithUtf8Bom: false,
			}),
		).toThrow();
		expect(testDoubles.parseErrors.add).toHaveBeenCalledWith(
			1,
			expect.objectContaining({ failure_location: expect.any(String) }),
		);
	});

	it.each([
		'{"api_key":"credential-sentinel"',
		"{Authorization: Bearer bearer-sentinel",
		'{"private-workout-field":"private-workout-sentinel"',
	])("redacts malformed content from stderr: %s", (line) => {
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		expect(() =>
			deserializeMessageWithObservability(line, {
				lastChunkByteLength: Buffer.byteLength(line),
				lastChunkStartsWithUtf8Bom: false,
			}),
		).toThrow();

		const diagnostic = String(stderrSpy.mock.calls[0]?.[0]);
		const shapePreview = extractShapePreview(diagnostic);
		expect(diagnostic).toContain("shape_preview_redacted=true");
		expect(diagnostic).not.toContain("credential-sentinel");
		expect(diagnostic).not.toContain("bearer-sentinel");
		expect(diagnostic).not.toContain("private-workout-sentinel");
		expect(shapePreview.length).toBeLessThanOrEqual(200);
	});

	it("keeps the SDK-internal transport adapter package-local", () => {
		const transport = {} as Parameters<
			typeof createInstrumentedStdioTransport
		>[0];
		expect(createInstrumentedStdioTransport(transport)).toBe(transport);
	});

	it("wraps _ondata, preserves buffering, and records the last chunk", () => {
		const { originalOnData, readBuffer, transport } = createTransportDouble();
		createInstrumentedStdioTransport(
			transport as unknown as StdioServerTransport,
		);
		const firstChunk = Buffer.from('\uFEFF{"jsonrpc":"2.0","id":1,', "utf8");
		const secondChunk = Buffer.from('"method":"ping"}\r\n', "utf8");

		transport._ondata(firstChunk);
		expect(readBuffer.readMessage()).toBeNull();
		transport._ondata(secondChunk);

		expect(originalOnData).toHaveBeenNthCalledWith(1, firstChunk);
		expect(originalOnData).toHaveBeenNthCalledWith(2, secondChunk);
		expect(readBuffer.readMessage()).toMatchObject({ id: 1, method: "ping" });
		expect(testDoubles.startActiveSpan).toHaveBeenCalledWith(
			"mcp.stdio.deserialize",
			expect.objectContaining({
				attributes: expect.objectContaining({
					"mcp.stdio.parse.chunk.last_byte_length": secondChunk.byteLength,
					"mcp.stdio.parse.chunk.last_had_utf8_bom": false,
				}),
			}),
			expect.any(Function),
		);
	});

	it("parses multiple messages buffered in one chunk", () => {
		const { readBuffer, transport } = createTransportDouble();
		createInstrumentedStdioTransport(
			transport as unknown as StdioServerTransport,
		);
		transport._ondata(
			Buffer.from(
				'{"jsonrpc":"2.0","id":1,"method":"ping"}\n' +
					'{"jsonrpc":"2.0","id":2,"method":"ping"}\n',
				"utf8",
			),
		);

		expect(readBuffer.readMessage()).toMatchObject({ id: 1 });
		expect(readBuffer.readMessage()).toMatchObject({ id: 2 });
		expect(readBuffer.readMessage()).toBeNull();
	});

	it("continues after malformed input with the real SDK transport", async () => {
		const stdin = new PassThrough();
		const stdout = new Writable({
			write(_chunk, _encoding, callback) {
				callback();
			},
		});
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const transport = createInstrumentedStdioTransport(
			new (
				await import("@modelcontextprotocol/server/stdio")
			).StdioServerTransport(stdin, stdout),
		);
		let resolveProcessed!: () => void;
		const processed = new Promise<void>((resolve) => {
			resolveProcessed = resolve;
		});
		const onMessage = vi.fn(() => resolveProcessed());
		const onError = vi.fn();
		transport.onmessage = onMessage;
		transport.onerror = onError;

		try {
			await transport.start();
			stdin.write(
				'{malformed}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n',
			);
			await processed;

			expect(onError).not.toHaveBeenCalled();
			expect(onMessage).toHaveBeenCalledWith({
				jsonrpc: "2.0",
				method: "notifications/initialized",
			});
			expect(stderrSpy).toHaveBeenCalledWith(
				expect.stringContaining("Failed to parse MCP stdin message"),
			);
		} finally {
			await transport.close();
			stdin.destroy();
			stdout.destroy();
		}
	});

	it("rethrows unexpected parser failures from the transport adapter", () => {
		const { readBuffer, transport } = createTransportDouble();
		const unexpected = new Error("instrumentation failure");
		unexpected.name = "ZodError";
		sdkSharedTestDoubles.deserializeMessage.mockImplementationOnce(() => {
			throw unexpected;
		});
		createInstrumentedStdioTransport(
			transport as unknown as StdioServerTransport,
		);
		transport._ondata?.(Buffer.from('{"jsonrpc":"2.0"}\n', "utf8"));

		expect(() => readBuffer.readMessage()).toThrow(unexpected);
	});
	it("defers the message after the malformed-line drain cap", async () => {
		const { readBuffer, transport } = createTransportDouble();
		createInstrumentedStdioTransport(
			transport as unknown as StdioServerTransport,
		);
		const malformedLines = Array.from({ length: 100 }, () => "{bad}").join(
			"\n",
		);
		transport._ondata?.(
			Buffer.from(
				`${malformedLines}\n{"jsonrpc":"2.0","id":1,"method":"ping"}\n`,
				"utf8",
			),
		);

		expect(readBuffer.readMessage()).toBeNull();
		await new Promise((resolve) => setImmediate(resolve));
		expect(readBuffer.readMessage()).toMatchObject({ id: 1, method: "ping" });
	});

	it("rethrows the original parser error when diagnostics fail", () => {
		const parserError = new Error("private parser failure at position 3");
		sdkSharedTestDoubles.deserializeMessage.mockImplementationOnce(() => {
			throw parserError;
		});
		vi.spyOn(console, "error").mockImplementation(() => {
			throw new Error("stderr unavailable");
		});

		expect(() =>
			deserializeMessageWithObservability("bad", {
				lastChunkByteLength: 3,
				lastChunkStartsWithUtf8Bom: false,
			}),
		).toThrow(parserError);
	});
});
