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
		const readBuffer: {
			_buffer?: Buffer;
			readMessage: () => unknown;
		} = {
			_buffer: undefined,
			readMessage: () => null,
		};
		const fakeTransport = {
			_readBuffer: readBuffer,
			_ondata: (chunk: Buffer) => {
				readBuffer._buffer = readBuffer._buffer
					? Buffer.concat([readBuffer._buffer, chunk])
					: chunk;
			},
		};

		createInstrumentedStdioTransport(
			fakeTransport as unknown as StdioServerTransport,
		);
		fakeTransport._ondata(
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
});
