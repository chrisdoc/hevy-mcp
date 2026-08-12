import type { ErrorEvent } from "@sentry/node";
import { HevyHttpError } from "@hevy-mcp/hevy-client";
import type { Span } from "@opentelemetry/api";
type ScopeDouble = {
	setTag: typeof testDoubles.setTag;
	setContext: typeof testDoubles.setContext;
	setFingerprint: typeof testDoubles.setFingerprint;
};
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	captureFailure,
	normalizeFailure,
	sanitizeDiagnosticText,
	sanitizeSentryEvent,
} from "./failure-reporter.js";

const testDoubles = vi.hoisted(() => ({
	captureException: vi.fn(() => "event-id"),
	setTag: vi.fn(),
	setContext: vi.fn(),
	setFingerprint: vi.fn(),
}));

vi.mock("@sentry/node", () => ({
	withScope: vi.fn((callback: (scope: ScopeDouble) => unknown) =>
		callback({
			setTag: testDoubles.setTag,
			setContext: testDoubles.setContext,
			setFingerprint: testDoubles.setFingerprint,
		}),
	),
	captureException: testDoubles.captureException,
}));

vi.mock("@opentelemetry/api", () => ({
	SpanStatusCode: { ERROR: 2 },
	trace: {
		getActiveSpan: vi.fn(() => undefined),
	},
}));

const spanDoubles = {
	addEvent: vi.fn(),
	recordException: vi.fn(),
	setAttributes: vi.fn(),
	setAttribute: vi.fn(),
	setStatus: vi.fn(),
	spanContext: vi.fn(() => ({ traceId: "trace-id", spanId: "span-id" })),
};
const span = spanDoubles as unknown as Span;

describe("failure reporter", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("scrubs credentials, URLs, control characters, and home paths", () => {
		const value =
			"Bearer bearer-secret api-key=api-secret jane@example.com https://example.test/path?secret=1\n/home/alice/project\u0000";

		const result = sanitizeDiagnosticText(value);

		expect(result).not.toContain("bearer-secret");
		expect(result).not.toContain("api-secret");
		expect(result).not.toContain("https://example.test");
		expect(result).not.toContain("jane@example.com");
		expect(result).not.toContain("/home/alice");
		expect(result).toContain("[EMAIL_REDACTED]");
		expect(result).not.toContain("\u0000");
		expect(result).toContain("[REDACTED]");
	});

	it("normalizes useful error details without exporting raw secrets", () => {
		const error = new Error(
			"request failed: Bearer api-secret https://example.test/workouts?id=1",
		);
		error.stack =
			"Error: request failed: Bearer api-secret\n    at run (/Users/alice/hevy-mcp/packages/node/src/index.ts:10:2)";

		const record = normalizeFailure(error, {
			kind: "tool",
			attributes: {
				"mcp.tool.name": "get-workouts",
				"error.type": "NETWORK_ERROR",
				"error.code": "ETIMEDOUT",
				"exception.source": "tool-observer",
				"secret.value": "should-not-reach-telemetry",
			},
		});

		expect(record.exceptionType).toBe("Error");
		expect(record.message).toContain("[REDACTED]");
		expect(record.message).not.toContain("api-secret");
		expect(record.message).not.toContain("example.test");
		expect(record.stack).not.toContain("/Users/alice");
		expect(record.attributes).toMatchObject({
			"mcp.tool.name": "get-workouts",
			"error.type": "NETWORK_ERROR",
			"error.code": "ETIMEDOUT",
			"exception.source": "tool-observer",
			"exception.type": "Error",
		});
		expect(record.attributes).not.toHaveProperty("secret.value");
		expect(record.fingerprint).toEqual([
			"mcp",
			"tool",
			"get-workouts",
			"NETWORK_ERROR",
			"Error",
			"ETIMEDOUT",
		]);
	});

	it("does not promote malformed thrown strings to diagnostic messages", () => {
		const record = normalizeFailure("prompt-secret", { kind: "process" });

		expect(record.message).toBeUndefined();
		expect(record.stack).toBeUndefined();
		expect(JSON.stringify(record)).not.toContain("prompt-secret");
	});

	it("removes untrusted Sentry fields while retaining bounded MCP context", () => {
		const event: ErrorEvent = {
			type: undefined,
			message: "Bearer secret https://example.test/?token=1",
			request: { url: "https://example.test/private?token=1" },
			user: { id: "user-secret" },
			breadcrumbs: [{ message: "response body secret" }],
			extra: { secret: "response-body-secret" },
			contexts: {
				mcp: { "error.category": "McpToolFailure", secret: "hidden" },
				untrusted: { value: "drop" },
			},
			tags: {
				"error.category": "McpToolFailure",
				secret: "drop",
			},
			exception: {
				values: [
					{
						type: "Error",
						value: "Bearer exception-secret",
						stacktrace: {
							frames: [
								{
									filename: "/Users/alice/hevy-mcp/dist/index.mjs",
									vars: { secret: "drop" },
								},
							],
						},
					},
				],
			},
		};

		const sanitized = sanitizeSentryEvent(event);
		const serialized = JSON.stringify(sanitized);

		expect(sanitized.request).toBeUndefined();
		expect(sanitized.user).toBeUndefined();
		expect(sanitized.breadcrumbs).toBeUndefined();
		expect(sanitized.extra).toBeUndefined();
		expect(sanitized.contexts).toEqual({
			mcp: { "error.category": "McpToolFailure" },
		});
		expect(
			sanitized.exception?.values?.[0]?.stacktrace?.frames?.[0],
		).toMatchObject({ filename: "~/dist/index.mjs" });
		expect(sanitized.tags).toEqual({
			"error.category": "McpToolFailure",
		});
		expect(serialized).not.toContain("secret");
		expect(serialized).not.toContain("/Users/alice");
	});

	it("keeps sanitized response diagnostics in context and failure events", () => {
		const error = new HevyHttpError("request failed", {
			status: 500,
			method: "PUT",
			endpoint: "/v1/workouts/:workoutId",
			code: "HEVY_RETRY_EXHAUSTED",
			data: {
				message: "Invalid email jane@example.com; token=raw-token",
			},
		});

		captureFailure(error, { kind: "api", span });

		expect(testDoubles.setContext).toHaveBeenCalledWith(
			"mcp",
			expect.objectContaining({
				"hevy.api.response_error":
					"Invalid email [EMAIL_REDACTED]; token=[REDACTED]",
			}),
		);
		expect(testDoubles.setTag).not.toHaveBeenCalledWith(
			"hevy.api.response_error",
			expect.anything(),
		);
		expect(spanDoubles.addEvent).toHaveBeenCalledWith("mcp.failure.detail", {
			"hevy.api.response_error":
				"Invalid email [EMAIL_REDACTED]; token=[REDACTED]",
		});
	});

	it("captures one sanitized Sentry event and one owning OTel exception", () => {
		const error = new Error("tool failed");

		const receipt = captureFailure(error, {
			kind: "tool",
			attributes: {
				"mcp.tool.name": "get-workouts",
				"error.type": "UNKNOWN_ERROR",
			},
			span,
		});

		expect(receipt).toEqual({
			diagnosticId: expect.stringMatching(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
			),
			eventId: "event-id",
			traceId: "trace-id",
			spanId: "span-id",
		});
		expect(testDoubles.captureException).toHaveBeenCalledOnce();
		expect(testDoubles.setFingerprint).toHaveBeenCalledWith([
			"mcp",
			"tool",
			"get-workouts",
			"UNKNOWN_ERROR",
			"Error",
			"none",
		]);
		expect(testDoubles.setTag).toHaveBeenCalledWith(
			"mcp.failure.id",
			expect.any(String),
		);
		expect(spanDoubles.recordException).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Error", message: "tool failed" }),
		);
		expect(spanDoubles.setAttribute).toHaveBeenCalledWith(
			"sentry.event_id",
			"event-id",
		);
	});

	it("deduplicates the same native error across nested observers", () => {
		const error = new Error("nested failure");

		captureFailure(error, { kind: "tool", span });
		captureFailure(error, { kind: "sdk", span });

		expect(testDoubles.captureException).toHaveBeenCalledOnce();
		expect(spanDoubles.recordException).toHaveBeenCalledOnce();
	});

	it("keeps expected failures out of Sentry and span error status", () => {
		captureFailure(new Error("expected outcome"), {
			kind: "api",
			expected: true,
			span,
		});

		expect(testDoubles.captureException).not.toHaveBeenCalled();
		expect(spanDoubles.recordException).not.toHaveBeenCalled();
		expect(spanDoubles.setStatus).not.toHaveBeenCalled();
		expect(spanDoubles.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({ "error.expected": true }),
		);
	});

	it("swallows provider failures without throwing to the caller", () => {
		testDoubles.captureException.mockImplementationOnce(() => {
			throw new Error("Sentry unavailable");
		});
		spanDoubles.recordException.mockImplementationOnce(() => {
			throw new Error("OTel unavailable");
		});

		expect(() =>
			captureFailure(new Error("application failure"), {
				kind: "process",
				span,
			}),
		).not.toThrow();
	});

	it("can suppress diagnostic messages while retaining error taxonomy", async () => {
		const originalSetting = process.env.HEVY_MCP_TELEMETRY_DIAGNOSTICS;
		process.env.HEVY_MCP_TELEMETRY_DIAGNOSTICS = "0";
		vi.resetModules();
		try {
			const module = await import("./failure-reporter.js");
			const record = module.normalizeFailure(new Error("private detail"), {
				kind: "process",
			});

			expect(record.message).toBeUndefined();
			expect(record.stack).toBeUndefined();
			expect(record.exceptionType).toBe("Error");
		} finally {
			if (originalSetting === undefined) {
				delete process.env.HEVY_MCP_TELEMETRY_DIAGNOSTICS;
			} else {
				process.env.HEVY_MCP_TELEMETRY_DIAGNOSTICS = originalSetting;
			}
			vi.resetModules();
		}
	});
});
