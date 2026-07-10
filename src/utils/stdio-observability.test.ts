import { PassThrough, Writable } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
	afterEach(() => {
		vi.restoreAllMocks();
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
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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
		expect(stderrSpy).toHaveBeenCalledWith(
			expect.stringContaining("Failed to parse MCP stdin message"),
		);
		expect(stderrSpy).toHaveBeenCalledWith(
			expect.stringContaining("line_bytes=4"),
		);
		expect(stderrSpy).toHaveBeenCalledWith(
			expect.stringContaining("failure_location=line_start_bom"),
		);
		stderrSpy.mockRestore();
	});

	it.each([
		{
			name: "quoted token",
			line: '{"token":"quoted-value-sentinel"',
			sentinels: ['"token"', "quoted-value-sentinel"],
		},
		{
			name: "api_key",
			line: '{"api_key":"underscore-credential-sentinel"',
			sentinels: ["api_key", "underscore-credential-sentinel"],
		},
		{
			name: "api-key",
			line: '{"api-key":"hyphen-credential-sentinel"',
			sentinels: ["api-key", "hyphen-credential-sentinel"],
		},
		{
			name: "mixed casing and whitespace",
			line: '{ "AuThOrIzAtIoN" \t : \t "mixed-credential-sentinel"',
			sentinels: ["AuThOrIzAtIoN", "mixed-credential-sentinel"],
		},
		{
			name: "unquoted authorization bearer credential",
			line: "{Authorization: Bearer bare-credential-sentinel",
			sentinels: ["Authorization", "Bearer", "bare-credential-sentinel"],
		},
		{
			name: "JSON unicode escaped sensitive key",
			line: '{"\\u0061pi_key":"unicode-credential-sentinel"',
			sentinels: ["\\u0061pi_key", "unicode-credential-sentinel"],
		},
		{
			name: "unknown custom field",
			line: '{"private-workout-field-sentinel":"private-workout-value-sentinel"',
			sentinels: [
				"private-workout-field-sentinel",
				"private-workout-value-sentinel",
			],
		},
	])(
		"emits only a structural redacted preview for $name",
		({ line, sentinels }) => {
			const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			expect(() =>
				deserializeMessageWithObservability(line, {
					lastChunkByteLength: Buffer.byteLength(line),
					lastChunkStartsWithUtf8Bom: false,
				}),
			).toThrow();

			expect(stderrSpy).toHaveBeenCalledTimes(1);
			const diagnostic = String(stderrSpy.mock.calls[0]?.[0]);
			expect(diagnostic).toContain("error_kind=SyntaxError");
			expect(diagnostic).toContain("[REDACTED]");
			expect(diagnostic).toContain("shape_preview_redacted=true");
			expect(diagnostic).toContain("shape_preview_truncated=false");
			expect(diagnostic).not.toMatch(/[\r\n]/);
			for (const sentinel of sentinels) {
				expect(diagnostic).not.toContain(sentinel);
			}

			const shapePreview = diagnostic.match(
				/ shape_preview="(.*?)" shape_preview_redacted=/,
			)?.[1];
			expect(shapePreview).toBeDefined();
			expect(shapePreview?.length).toBeLessThanOrEqual(200);
			const structuralPunctuation = shapePreview
				?.replaceAll("[REDACTED]", "")
				.replaceAll("\\s", "");
			expect(
				structuralPunctuation
					?.split("")
					.every((character) => '{}[]:,\\"'.includes(character)),
			).toBe(true);
		},
	);

	it("bounds long structural previews at 200 escaped characters", () => {
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const line = `{${Array.from(
			{ length: 80 },
			(_, index) => `"key-sentinel-${index}":"value-sentinel-${index}"`,
		).join(",")}`;

		expect(() =>
			deserializeMessageWithObservability(line, {
				lastChunkByteLength: Buffer.byteLength(line),
				lastChunkStartsWithUtf8Bom: false,
			}),
		).toThrow();

		expect(stderrSpy).toHaveBeenCalledTimes(1);
		const diagnostic = String(stderrSpy.mock.calls[0]?.[0]);
		const shapePreview = diagnostic.match(
			/ shape_preview="(.*?)" shape_preview_redacted=/,
		)?.[1];
		expect(shapePreview?.length).toBeLessThanOrEqual(200);
		expect(diagnostic).toContain("shape_preview_redacted=true");
		expect(diagnostic).toContain("shape_preview_truncated=true");
		expect(diagnostic).not.toContain("key-sentinel");
		expect(diagnostic).not.toContain("value-sentinel");
		expect(diagnostic).not.toMatch(/[\r\n]/);
	});

	it("omits parser messages and names while rethrowing the original error", () => {
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const parserError = new Error(
			"parser-message-sentinel from private input at position 3",
		);
		parserError.name = "custom-error-name-sentinel";
		sdkSharedTestDoubles.deserializeMessage.mockImplementationOnce(() => {
			throw parserError;
		});

		let thrownError: unknown;
		try {
			deserializeMessageWithObservability("private-line-sentinel", {
				lastChunkByteLength: 21,
				lastChunkStartsWithUtf8Bom: false,
			});
		} catch (error) {
			thrownError = error;
		}

		expect(thrownError).toBe(parserError);
		expect(stderrSpy).toHaveBeenCalledTimes(1);
		const diagnostic = String(stderrSpy.mock.calls[0]?.[0]);
		expect(diagnostic).toContain("error_kind=Error");
		expect(diagnostic).toContain("failure_position=3");
		expect(diagnostic).not.toContain("parser-message-sentinel");
		expect(diagnostic).not.toContain("custom-error-name-sentinel");
		expect(diagnostic).not.toContain("private-line-sentinel");
		expect(diagnostic).not.toContain("message=");
	});

	it("rethrows the original parser error when stderr diagnostics fail", () => {
		const parserError = new Error("original parser failure at position 3");
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

	it("continues after malformed input with the real stdio transport", async () => {
		const stdin = new PassThrough();
		let stdout = "";
		const capturedStdout = new Writable({
			write(chunk, _encoding, callback) {
				stdout += chunk.toString();
				callback();
			},
		});
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const transport = createInstrumentedStdioTransport(
			new StdioServerTransport(stdin, capturedStdout),
		);
		const onMessage = vi.fn();
		const onError = vi.fn();
		transport.onmessage = onMessage;
		transport.onerror = onError;

		try {
			await transport.start();
			expect(() =>
				stdin.write(
					'{malformed json}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n',
				),
			).not.toThrow();

			expect(onError).toHaveBeenCalledTimes(1);
			expect(onMessage).toHaveBeenCalledWith({
				jsonrpc: "2.0",
				method: "notifications/initialized",
			});
			expect(stderrSpy).toHaveBeenCalledWith(
				expect.stringContaining("Failed to parse MCP stdin message"),
			);
			expect(stdout).toBe("");
		} finally {
			await transport.close();
			stdin.destroy();
			capturedStdout.destroy();
			stderrSpy.mockRestore();
		}
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
