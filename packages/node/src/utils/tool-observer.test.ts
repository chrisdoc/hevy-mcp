import {
	ErrorType,
	type SafeToolCompletion,
	type SafeToolInvocation,
} from "@hevy-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNodeToolObserver } from "./tool-observer.js";

const testDoubles = vi.hoisted(() => ({
	activeSpanDepth: 0,
	span: {
		addEvent: vi.fn(),
		setAttribute: vi.fn(),
		setStatus: vi.fn(),
		recordException: vi.fn(),
		end: vi.fn(),
	},
	startActiveSpan: vi.fn(
		(
			_name: string,
			_options: unknown,
			callback: (span: unknown) => unknown,
		) => {
			testDoubles.activeSpanDepth += 1;
			return Promise.resolve(callback(testDoubles.span)).finally(() => {
				testDoubles.activeSpanDepth -= 1;
			});
		},
	),
	toolInvocationsAdd: vi.fn(),
	toolOutcomesAdd: vi.fn(),
	toolErrorsAdd: vi.fn(),
	toolDurationRecord: vi.fn(),
	recordMcpToolInvocation: vi.fn(() => ({
		client_name: "Claude-Desktop",
		client_version: "1.2.3",
		protocol_version: "2025-11-25",
		transport: "stdio" as const,
	})),
	recordMcpToolFailure: vi.fn(),
	getCurrentMcpClientMetadata: vi.fn(() => ({
		name: "Claude-Desktop",
		version: "1.2.3",
		protocolVersion: "2025-11-25",
	})),
	sentryWithScope: vi.fn((callback: (scope: unknown) => void) =>
		callback({
			setTag: vi.fn(),
			setContext: vi.fn(),
			setFingerprint: testDoubles.sentrySetFingerprint,
		}),
	),
	sentrySetFingerprint: vi.fn(),
	sentryCaptureMessage: vi.fn(),
}));

vi.mock("./telemetry.js", () => ({
	tracer: { startActiveSpan: testDoubles.startActiveSpan },
	Sentry: {
		withScope: testDoubles.sentryWithScope,
		captureMessage: testDoubles.sentryCaptureMessage,
	},
}));

vi.mock("./metrics.js", () => ({
	toolInvocations: { add: testDoubles.toolInvocationsAdd },
	toolOutcomes: { add: testDoubles.toolOutcomesAdd },
	toolErrors: { add: testDoubles.toolErrorsAdd },
	toolDuration: { record: testDoubles.toolDurationRecord },
}));

vi.mock("./mcp-session-observability.js", () => ({
	recordMcpToolInvocation: testDoubles.recordMcpToolInvocation,
	recordMcpToolFailure: testDoubles.recordMcpToolFailure,
	getCurrentMcpClientMetadata: testDoubles.getCurrentMcpClientMetadata,
}));

vi.mock("@opentelemetry/api", () => ({
	SpanStatusCode: { OK: 1, ERROR: 2 },
}));

const invocation = {
	name: "get-workouts",
	taxonomy: {
		feature: "workouts",
		kind: "read",
		operation: "list",
	},
	argumentKeys: ["page", "query", "includeCustom"],
	argumentPresence: { query: true },
	numericArgumentBuckets: { page: "2-10" },
	booleanArguments: { includeCustom: true },
	argumentKeyCountBucket: "2-10",
} satisfies SafeToolInvocation;

function startScope() {
	const scope = createNodeToolObserver().start(invocation);
	if (!scope) throw new Error("Expected the Node observer to create a scope");
	return scope;
}

describe("createNodeToolObserver", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		testDoubles.activeSpanDepth = 0;
	});

	it("preserves bounded taxonomy, argument, client, and result telemetry", async () => {
		const operation = vi.fn(() => {
			expect(testDoubles.activeSpanDepth).toBe(1);
			return Promise.resolve("result");
		});
		const scope = startScope();

		await expect(scope.run(operation)).resolves.toBe("result");
		await scope.finish({
			outcome: "success",
			durationMs: 12,
			result: {
				isError: false,
				hasStructuredContent: true,
				contentCountBucket: "2-10",
				summary: { itemCountBucket: "11-50" },
			},
		});

		expect(operation).toHaveBeenCalledOnce();
		expect(testDoubles.recordMcpToolInvocation).toHaveBeenCalledOnce();
		expect(testDoubles.toolInvocationsAdd).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				tool_name: "get-workouts",
				"hevy.feature": "workouts",
				"mcp.tool.kind": "read",
				"mcp.tool.operation": "list",
				client_name: "Claude-Desktop",
			}),
		);
		expect(testDoubles.startActiveSpan).toHaveBeenCalledWith(
			"mcp.tool.get-workouts",
			{
				attributes: expect.objectContaining({
					"mcp.tool.name": "get-workouts",
					"hevy.feature": "workouts",
					"mcp.tool.kind": "read",
					"mcp.tool.operation": "list",
					"mcp.client.name": "Claude-Desktop",
					"mcp.client.version": "1.2.3",
					"mcp.protocol.version": "2025-11-25",
					"mcp.transport": "stdio",
					"mcp.tool.args.key_count_bucket": "2-10",
					"mcp.tool.args.keys": "page,query,includeCustom",
					"mcp.tool.args.query.present": true,
					"mcp.tool.args.page.bucket": "2-10",
					"mcp.tool.args.includeCustom": true,
				}),
			},
			expect.any(Function),
		);
		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({ code: 1 });
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.tool.result.content_count_bucket",
			"2-10",
		);
		expect(testDoubles.toolDurationRecord).toHaveBeenCalledWith(
			12,
			expect.objectContaining({
				tool_name: "get-workouts",
				outcome: "success",
				is_error: "false",
				"mcp.tool.result.content_count_bucket": "2-10",
				"mcp.tool.result.item_count_bucket": "11-50",
			}),
		);
		expect(testDoubles.recordMcpToolFailure).not.toHaveBeenCalled();
		expect(testDoubles.span.end).toHaveBeenCalledOnce();
	});

	it("records only core-sanitized diagnostics for thrown errors", async () => {
		const secret = "private-error-message-and-stack";
		const error = new Error(secret);
		const scope = startScope();

		await expect(scope.run(() => Promise.reject(error))).rejects.toBe(error);
		const completion: SafeToolCompletion = {
			outcome: "thrown_error",
			durationMs: 7,
			errorType: ErrorType.NETWORK_ERROR,
			error: {
				category: "HevyHttpError",
				code: "ETIMEDOUT",
				status: 503,
				method: "GET",
				endpoint: "/v1/workouts",
			},
		};
		await scope.finish(completion);

		expect(testDoubles.span.recordException).not.toHaveBeenCalled();
		expect(testDoubles.sentryCaptureMessage).toHaveBeenCalledWith(
			"MCP tool failure",
			"error",
		);
		expect(testDoubles.sentrySetFingerprint).toHaveBeenCalledWith([
			"mcp-tool-failure",
			"get-workouts",
			"HevyHttpError",
			"ETIMEDOUT",
			"503",
			"/v1/workouts",
		]);
		expect(testDoubles.span.addEvent).toHaveBeenCalledWith("mcp.tool.failure", {
			"error.category": "HevyHttpError",
			"error.code": "ETIMEDOUT",
			"http.status_code": 503,
			"http.method": "GET",
			"hevy.api.endpoint": "/v1/workouts",
		});
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"error.type",
			"NETWORK_ERROR",
		);
		expect(testDoubles.recordMcpToolFailure).toHaveBeenCalledOnce();
		expect(testDoubles.toolErrorsAdd).toHaveBeenCalledWith(
			1,
			expect.objectContaining({ error_type: "NETWORK_ERROR" }),
		);
		expect(testDoubles.toolOutcomesAdd).toHaveBeenCalledWith(
			1,
			expect.objectContaining({ outcome: "thrown_error" }),
		);
		expect(
			JSON.stringify([
				testDoubles.span.addEvent.mock.calls,
				testDoubles.span.setAttribute.mock.calls,
				testDoubles.toolErrorsAdd.mock.calls,
			]),
		).not.toContain(secret);
		expect(testDoubles.span.end).toHaveBeenCalledOnce();
	});

	it("marks returned MCP errors as session failures without error exceptions", async () => {
		const scope = startScope();
		await scope.run(() => Promise.resolve("returned error"));
		await scope.finish({
			outcome: "returned_error",
			durationMs: 3,
			result: {
				isError: true,
				hasStructuredContent: false,
				contentCountBucket: "1",
			},
		});

		expect(testDoubles.recordMcpToolFailure).toHaveBeenCalledOnce();
		expect(testDoubles.toolErrorsAdd).not.toHaveBeenCalled();
		expect(testDoubles.span.recordException).not.toHaveBeenCalled();
		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({ code: 2 });
	});
});
