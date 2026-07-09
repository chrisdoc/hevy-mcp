import type { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createInstrumentedStdioTransport,
	deserializeMessageWithObservability,
} from "./stdio-observability";
import { Sentry } from "./telemetry.js";

const testDoubles = vi.hoisted(() => ({
	span: {
		setAttribute: vi.fn(),
		setStatus: vi.fn(),
		recordException: vi.fn(),
		end: vi.fn(),
	},
	scope: {
		setTag: vi.fn(),
		setContext: vi.fn(),
	},
	startActiveSpan: vi.fn((...args: unknown[]) => {
		const cb = args[args.length - 1] as (span: unknown) => unknown;
		return cb(testDoubles.span);
	}),
}));

const sdkSharedTestDoubles = vi.hoisted(() => ({
	deserializeMessage: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/shared/stdio.js", async () => {
	const actual = await vi.importActual<
		typeof import("@modelcontextprotocol/sdk/shared/stdio.js")
	>("@modelcontextprotocol/sdk/shared/stdio.js");

	sdkSharedTestDoubles.deserializeMessage.mockImplementation(
		actual.deserializeMessage,
	);

	return {
		...actual,
		deserializeMessage: sdkSharedTestDoubles.deserializeMessage,
	};
});

vi.mock("./telemetry.js", () => ({
	Sentry: {
		withScope: vi.fn((cb: (scope: unknown) => void) => cb(testDoubles.scope)),
		captureException: vi.fn(),
	},
	tracer: {
		startActiveSpan: testDoubles.startActiveSpan,
	},
	meter: {
		createCounter: vi.fn(() => ({ add: vi.fn() })),
		createHistogram: vi.fn(() => ({ record: vi.fn() })),
	},
	serviceName: "hevy-mcp",
	serviceVersion: "dev",
	setCurrentUserId: vi.fn(),
	getCurrentUserId: vi.fn(() => undefined),
}));

vi.mock("./metrics.js", () => ({
	toolInvocations: { add: vi.fn() },
	toolErrors: { add: vi.fn() },
	toolDuration: { record: vi.fn() },
	apiCalls: { add: vi.fn() },
	apiDuration: { record: vi.fn() },
	stdioParseErrors: { add: vi.fn() },
	serverStartups: { add: vi.fn() },
}));

vi.mock("@opentelemetry/api", () => ({
	SpanStatusCode: { OK: 1, ERROR: 2 },
	trace: { getTracer: vi.fn() },
	metrics: { getMeter: vi.fn() },
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

describe("stdio observability", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("parses valid messages after stripping a leading BOM", () => {
		const line = '\uFEFF{"jsonrpc":"2.0","id":1,"method":"ping"}';
		const message = deserializeMessageWithObservability(line, {
			lastChunkByteLength: 64,
			lastChunkStartsWithUtf8Bom: true,
		});

		expect(message).toMatchObject({
			jsonrpc: "2.0",
			id: 1,
			method: "ping",
		});
		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({ code: 1 });
		expect(Sentry.captureException).not.toHaveBeenCalled();
		expect(testDoubles.startActiveSpan).toHaveBeenCalledWith(
			"mcp.stdio.deserialize",
			expect.objectContaining({
				attributes: expect.objectContaining({
					"mcp.stdio.parse.line.had_leading_bom": true,
					"mcp.stdio.parse.line.bom_stripped": true,
				}),
			}),
			expect.any(Function),
		);
	});

	it("captures parse failures with structured metadata", () => {
		expect(() =>
			deserializeMessageWithObservability("\uFEFF{", {
				lastChunkByteLength: 2,
				lastChunkStartsWithUtf8Bom: true,
			}),
		).toThrow();

		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({ code: 2 });
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.stdio.parse.failure.location",
			"line_start_bom",
		);
		expect(testDoubles.scope.setTag).toHaveBeenCalledWith(
			"mcp.stdio.parse.failure.location",
			"line_start_bom",
		);
		expect(Sentry.captureException).toHaveBeenCalledTimes(1);
		expect(testDoubles.scope.setContext).toHaveBeenCalledWith(
			"mcpStdioParse",
			expect.objectContaining({
				lineHadLeadingBom: true,
				bomStripped: true,
				failureLocation: "line_start_bom",
				failureStage: "deserializeMessage",
			}),
		);
	});

	it("is a no-op when transport internals are unavailable", () => {
		const bareTransport = {} as StdioServerTransport;
		expect(createInstrumentedStdioTransport(bareTransport)).toBe(bareTransport);
	});

	it("patches transport readMessage and records chunk-level metadata", () => {
		const { readBuffer, transport } = createTransportDouble();
		createInstrumentedStdioTransport(
			transport as unknown as StdioServerTransport,
		);
		transport._ondata(
			Buffer.from('\uFEFF{"jsonrpc":"2.0","id":1,"method":"ping"}\n', "utf8"),
		);

		const message = readBuffer.readMessage();
		expect(message).toMatchObject({ method: "ping" });
		expect(testDoubles.startActiveSpan).toHaveBeenCalledWith(
			"mcp.stdio.deserialize",
			expect.objectContaining({
				attributes: expect.objectContaining({
					"mcp.stdio.parse.chunk.last_had_utf8_bom": true,
				}),
			}),
			expect.any(Function),
		);
	});

	it("returns null when no buffer is available", () => {
		const { readBuffer, transport } = createTransportDouble();
		createInstrumentedStdioTransport(
			transport as unknown as StdioServerTransport,
		);

		expect(readBuffer.readMessage()).toBeNull();
		expect(testDoubles.startActiveSpan).not.toHaveBeenCalled();
	});

	it("captures line_start failures with position metadata", () => {
		sdkSharedTestDoubles.deserializeMessage.mockImplementationOnce(() => {
			throw new Error("synthetic parse failure at position 0");
		});

		expect(() =>
			deserializeMessageWithObservability("{", {
				lastChunkByteLength: 1,
				lastChunkStartsWithUtf8Bom: false,
			}),
		).toThrow("synthetic parse failure at position 0");

		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.stdio.parse.failure.location",
			"line_start",
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.stdio.parse.failure.position",
			0,
		);
		expect(testDoubles.scope.setTag).toHaveBeenCalledWith(
			"mcp.stdio.parse.failure.location",
			"line_start",
		);
	});

	it("captures line_body failures with position metadata", () => {
		sdkSharedTestDoubles.deserializeMessage.mockImplementationOnce(() => {
			throw new Error("synthetic parse failure at position 17");
		});

		expect(() =>
			deserializeMessageWithObservability("{", {
				lastChunkByteLength: 1,
				lastChunkStartsWithUtf8Bom: false,
			}),
		).toThrow("synthetic parse failure at position 17");

		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.stdio.parse.failure.location",
			"line_body",
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.stdio.parse.failure.position",
			17,
		);
		expect(testDoubles.scope.setTag).toHaveBeenCalledWith(
			"mcp.stdio.parse.failure.location",
			"line_body",
		);
	});

	it("captures unknown failures without failure-position attribute", () => {
		sdkSharedTestDoubles.deserializeMessage.mockImplementationOnce(() => {
			throw "synthetic schema mismatch";
		});

		expect(() =>
			deserializeMessageWithObservability("{}", {
				lastChunkByteLength: 2,
				lastChunkStartsWithUtf8Bom: false,
			}),
		).toThrow();

		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.stdio.parse.failure.location",
			"unknown",
		);
		expect(testDoubles.span.setAttribute).not.toHaveBeenCalledWith(
			"mcp.stdio.parse.failure.position",
			expect.any(Number),
		);
		expect(testDoubles.scope.setTag).toHaveBeenCalledWith(
			"mcp.stdio.parse.failure.location",
			"unknown",
		);
		expect(testDoubles.scope.setContext).toHaveBeenCalledWith(
			"mcpStdioParse",
			expect.objectContaining({ errorName: "UnknownError" }),
		);
	});

	it("wraps _ondata, preserves original handler, and updates snapshots", () => {
		const { originalOnData, readBuffer, transport } = createTransportDouble();
		createInstrumentedStdioTransport(
			transport as unknown as StdioServerTransport,
		);

		const firstChunk = Buffer.from('\uFEFF{"jsonrpc":"2.0","id":1,', "utf8");
		const secondChunk = Buffer.from('"method":"ping"}\n', "utf8");
		transport._ondata(firstChunk);
		transport._ondata(secondChunk);

		expect(originalOnData).toHaveBeenNthCalledWith(1, firstChunk);
		expect(originalOnData).toHaveBeenNthCalledWith(2, secondChunk);
		expect(readBuffer.readMessage()).toMatchObject({ method: "ping" });
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

	it("returns null while waiting for newline-terminated buffers", () => {
		const { readBuffer, transport } = createTransportDouble();
		createInstrumentedStdioTransport(
			transport as unknown as StdioServerTransport,
		);
		transport._ondata(
			Buffer.from('{"jsonrpc":"2.0","id":1,"method":"ping"}', "utf8"),
		);

		expect(readBuffer.readMessage()).toBeNull();
		expect(testDoubles.startActiveSpan).not.toHaveBeenCalled();
	});

	it("handles CRLF-delimited lines", () => {
		const { readBuffer, transport } = createTransportDouble();
		createInstrumentedStdioTransport(
			transport as unknown as StdioServerTransport,
		);
		transport._ondata(
			Buffer.from('{"jsonrpc":"2.0","id":1,"method":"ping"}\r\n', "utf8"),
		);

		expect(readBuffer.readMessage()).toMatchObject({ method: "ping" });
	});

	it("parses multiple buffered messages from a single chunk", () => {
		const { readBuffer, transport } = createTransportDouble();
		createInstrumentedStdioTransport(
			transport as unknown as StdioServerTransport,
		);
		transport._ondata(
			Buffer.from(
				'{"jsonrpc":"2.0","id":1,"method":"ping"}\n' +
					'{"jsonrpc":"2.0","id":2,"method":"pong"}\n',
				"utf8",
			),
		);

		expect(readBuffer.readMessage()).toMatchObject({ id: 1, method: "ping" });
		expect(readBuffer.readMessage()).toMatchObject({ id: 2, method: "pong" });
		expect(readBuffer.readMessage()).toBeNull();
		expect(testDoubles.startActiveSpan).toHaveBeenCalledTimes(2);
	});

	it("parses messages split across multiple chunks", () => {
		const { readBuffer, transport } = createTransportDouble();
		createInstrumentedStdioTransport(
			transport as unknown as StdioServerTransport,
		);
		transport._ondata(Buffer.from('{"jsonrpc":"2.0","id":1,', "utf8"));

		expect(readBuffer.readMessage()).toBeNull();

		transport._ondata(Buffer.from('"method":"ping"}\n', "utf8"));
		expect(readBuffer.readMessage()).toMatchObject({ id: 1, method: "ping" });
	});
});
