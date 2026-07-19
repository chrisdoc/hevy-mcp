import { beforeEach, describe, expect, it, vi } from "vitest";
import { HevyHttpError } from "./hevy-http-error.js";
import { withTelemetry } from "./telemetry-wrapper.js";
import { attachResultTelemetry } from "./result-telemetry.js";

const testDoubles = vi.hoisted(() => ({
	span: {
		addEvent: vi.fn(),
		setAttribute: vi.fn(),
		setStatus: vi.fn(),
		recordException: vi.fn(),
		end: vi.fn(),
	},
	startActiveSpan: vi.fn((...args: unknown[]) => {
		const callback = args.at(-1) as (span: unknown) => unknown;
		return callback(testDoubles.span);
	}),
	toolInvocationsAdd: vi.fn(),
	toolOutcomesAdd: vi.fn(),
	toolErrorsAdd: vi.fn(),
	toolDurationRecord: vi.fn(),
}));

vi.mock("./telemetry.js", () => ({
	tracer: { startActiveSpan: testDoubles.startActiveSpan },
}));
vi.mock("./metrics.js", () => ({
	toolInvocations: { add: testDoubles.toolInvocationsAdd },
	toolOutcomes: { add: testDoubles.toolOutcomesAdd },
	toolErrors: { add: testDoubles.toolErrorsAdd },
	toolDuration: { record: testDoubles.toolDurationRecord },
	sessionStarted: { add: vi.fn() },
	sessionEnded: { add: vi.fn() },
}));

vi.mock("@opentelemetry/api", () => ({
	SpanStatusCode: { OK: 1, ERROR: 2 },
}));

describe("withTelemetry", () => {
	beforeEach(() => {
		delete process.env.HEVY_MCP_DEBUG;
		vi.clearAllMocks();
	});

	it("emits redacted debug input from the central tool wrapper", async () => {
		process.env.HEVY_MCP_DEBUG = "1";
		const stderrSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);
		const stdoutSpy = vi
			.spyOn(process.stdout, "write")
			.mockImplementation(() => true);
		const handler = vi.fn().mockResolvedValue({ content: [] });
		const args: Record<string, unknown> = {
			kneePain_notes: "Private Friday workout",
			johnToken: "secret-key",
			AliceDiagnosis: "personal notes",
			"私密な鍵🔒": "private unicode value",
			date: "2026-07-10",
			weightKg: 81.5,
			fatPercent: 18.2,
			waist: 84,
			workout: {
				nestedKneePain_notes: "nested private value",
				sets: [3, { nestedJohnToken: "nested token value" }],
			},
		};
		args.circular = args;

		await withTelemetry(handler, "create-body-measurement")(args);

		expect(handler).toHaveBeenCalledExactlyOnceWith(args);
		const output = String(stderrSpy.mock.calls[0]?.[0]);
		expect(output).toContain("[hevy-mcp:debug]");
		expect(output).toContain('"event":"tool_invocation"');
		expect(output).toContain('"tool":"create-body-measurement"');
		expect(output).toContain(
			'"params":{"type":"object","fieldCount":10,"fields":',
		);
		expect(output).toContain('"field-9":{"type":"object","fieldCount":2');
		expect(output).toContain('"type":"array","length":2');
		expect(output).toContain('"[circular]"');
		expect(output).not.toContain("kneePain_notes");
		expect(output).not.toContain("johnToken");
		expect(output).not.toContain("AliceDiagnosis");
		expect(output).not.toContain("私密な鍵🔒");
		expect(output).not.toContain("nestedKneePain_notes");
		expect(output).not.toContain("nestedJohnToken");
		expect(output).not.toContain("81.5");
		expect(output).not.toContain("18.2");
		expect(output).not.toContain("84");
		expect(output).not.toContain("2026-07-10");
		expect(output).not.toContain("Private Friday workout");
		expect(output).not.toContain("secret-key");
		expect(output).not.toContain("personal notes");
		expect(output).not.toContain("private unicode value");
		expect(output).not.toContain("nested private value");
		expect(output).not.toContain("nested token value");
		expect(stdoutSpy).not.toHaveBeenCalled();
		stderrSpy.mockRestore();
		stdoutSpy.mockRestore();
	});

	it("records successful invocations and normalizes nullish arguments", async () => {
		const response = { content: [{ type: "text" as const, text: "Success" }] };
		const handler = vi.fn().mockResolvedValue(response);
		const wrapped = withTelemetry(handler, "TestContext", {
			feature: "workouts",
			kind: "read",
			operation: "get",
		});

		const result = await Reflect.apply(wrapped, undefined, [null]);

		expect(result).toBe(response);
		expect(handler).toHaveBeenCalledWith({});
		expect(testDoubles.toolInvocationsAdd).toHaveBeenCalledWith(
			1,
			expect.objectContaining({ tool_name: "TestContext" }),
		);
		expect(testDoubles.startActiveSpan).toHaveBeenCalledWith(
			"mcp.tool.TestContext",
			{
				attributes: expect.objectContaining({
					"mcp.tool.name": "TestContext",
					"hevy.feature": "workouts",
					"mcp.tool.kind": "read",
					"mcp.tool.operation": "get",
					"mcp.tool.args.key_count_bucket": "0",
					"mcp.tool.args.keys": "",
					"mcp.client.name": "unknown",
				}),
			},
			expect.any(Function),
		);
		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({ code: 1 });
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.tool.result.is_error",
			false,
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.tool.outcome",
			"success",
		);
		expect(testDoubles.toolOutcomesAdd).toHaveBeenCalledWith(
			1,
			expect.objectContaining({ outcome: "success" }),
		);
		expect(testDoubles.toolDurationRecord).toHaveBeenCalledWith(
			expect.any(Number),
			expect.objectContaining({
				tool_name: "TestContext",
				is_error: "false",
				outcome: "success",
				"mcp.tool.result.has_structured_content": false,
			}),
		);
		expect(testDoubles.span.end).toHaveBeenCalledOnce();
	});

	it("records explicit workflow telemetry without inspecting result text", async () => {
		const response = { content: [{ type: "text" as const, text: "private" }] };
		attachResultTelemetry(response, {
			workflow: {
				name: "training-summary",
				pagination: { workouts: 2, bodyMeasurements: 1 },
				cacheStatus: "not-used",
				itemsScanned: 14,
			},
		});
		const handler = vi.fn().mockResolvedValue(response);

		await withTelemetry(handler, "get-training-summary")({});

		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"workflow.name",
			"training-summary",
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"workflow.cache_status",
			"not-used",
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"workflow.items_scanned",
			14,
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"workflow.pagination.workouts.pages",
			2,
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"workflow.pagination.bodyMeasurements.pages",
			1,
		);
		expect(
			JSON.stringify(testDoubles.span.setAttribute.mock.calls),
		).not.toContain("private");
	});

	it("ignores unregistered result metadata", async () => {
		const response = {
			content: [{ type: "text" as const, text: "{}" }],
			structuredContent: {
				workflow: {
					name: "malformed",
					pagination: { private: 2 },
					cacheStatus: "not-used",
					itemsScanned: 1,
				},
			},
		};

		await withTelemetry(vi.fn().mockResolvedValue(response), "Workflow")({});

		expect(testDoubles.span.setAttribute).not.toHaveBeenCalledWith(
			"workflow.name",
			expect.anything(),
		);
	});

	it("records only bounded argument structure", async () => {
		const handler = vi.fn().mockResolvedValue({ content: [] });
		const secretQuery = "private-routine-title-sentinel";

		await withTelemetry(
			handler,
			"ArgsContext",
		)({
			page: 2,
			privateNote: "hidden",
			pageSize: 10,
			query: secretQuery,
			includeCustom: true,
			limit: null,
			workoutId: "private-workout-id",
			date: "2026-07-10",
		});

		const spanCall = JSON.stringify(testDoubles.startActiveSpan.mock.calls);
		expect(spanCall).not.toContain(secretQuery);
		expect(spanCall).not.toContain("private-workout-id");
		expect(spanCall).not.toContain("2026-07-10");
		expect(spanCall).toContain('"mcp.tool.args.query.present":true');
		expect(spanCall).toContain('"mcp.tool.args.page.bucket":"2-10"');
		expect(spanCall).toContain('"mcp.tool.args.pageSize.bucket":"2-10"');
		expect(spanCall).toContain('"mcp.tool.args.includeCustom":true');
	});

	it("records returned MCP errors as a distinct safe outcome", async () => {
		const response = {
			isError: true,
			content: [
				{ type: "text" as const, text: "private returned error detail" },
				{ type: "text" as const, text: "second private detail" },
			],
		};

		await withTelemetry(
			vi.fn().mockResolvedValue(response),
			"ReturnedErrorContext",
		)({});

		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({ code: 2 });
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.tool.result.is_error",
			true,
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.tool.result.content_count",
			2,
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.tool.result.has_structured_content",
			false,
		);
		expect(testDoubles.toolErrorsAdd).not.toHaveBeenCalled();
		expect(testDoubles.toolOutcomesAdd).toHaveBeenCalledWith(
			1,
			expect.objectContaining({ outcome: "returned_error" }),
		);
		expect(testDoubles.toolDurationRecord).toHaveBeenCalledWith(
			expect.any(Number),
			expect.objectContaining({
				tool_name: "ReturnedErrorContext",
				is_error: "true",
				outcome: "returned_error",
				"mcp.tool.result.has_structured_content": false,
			}),
		);
		expect(
			JSON.stringify(testDoubles.span.setAttribute.mock.calls),
		).not.toContain("private returned error detail");
		expect(testDoubles.span.end).toHaveBeenCalledOnce();
	});

	it("records bounded large result shape metadata", async () => {
		const response = { content: [] };
		attachResultTelemetry(response, {
			itemCountBucket: "51+",
			exerciseCountBucket: "11-50",
			setCountBucket: "51+",
		});

		await withTelemetry(
			vi.fn().mockResolvedValue(response),
			"WriteContext",
		)({});

		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.tool.result.item_count_bucket",
			"51+",
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.tool.result.exercise_count_bucket",
			"11-50",
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.tool.result.set_count_bucket",
			"51+",
		);
		expect(testDoubles.toolDurationRecord).toHaveBeenCalledWith(
			expect.any(Number),
			expect.objectContaining({
				"mcp.tool.result.item_count_bucket": "51+",
				"mcp.tool.result.exercise_count_bucket": "11-50",
				"mcp.tool.result.set_count_bucket": "51+",
			}),
		);
	});

	it("records only safe diagnostics and rethrows the original value unchanged", async () => {
		const secret = "sentinel-telemetry-secret";
		const error = Object.assign(new Error(secret), {
			code: secret,
			cause: new Error(secret),
		});
		const handler = vi.fn().mockRejectedValue(error);

		const promise = withTelemetry(handler, "ThrownErrorContext")({});

		await expect(promise).rejects.toBe(error);
		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({ code: 2 });
		expect(testDoubles.span.recordException).not.toHaveBeenCalled();
		expect(testDoubles.span.addEvent).toHaveBeenCalledWith("mcp.tool.failure", {
			"error.category": "Error",
		});
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"error.type",
			"UNKNOWN_ERROR",
		);
		expect(JSON.stringify(testDoubles.span.addEvent.mock.calls)).not.toContain(
			secret,
		);
		expect(testDoubles.toolErrorsAdd).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				tool_name: "ThrownErrorContext",
				error_type: "UNKNOWN_ERROR",
			}),
		);
		expect(testDoubles.toolDurationRecord).toHaveBeenCalledWith(
			expect.any(Number),
			expect.objectContaining({
				tool_name: "ThrownErrorContext",
				is_error: "true",
				outcome: "thrown_error",
			}),
		);
		expect(testDoubles.span.end).toHaveBeenCalledOnce();
	});

	it("records rejected non-Error values and rethrows them unchanged", async () => {
		const handler = vi.fn().mockRejectedValue("string failure");

		const promise = withTelemetry(handler, "NonErrorContext")({});

		await expect(promise).rejects.toBe("string failure");
		expect(testDoubles.span.recordException).not.toHaveBeenCalled();
		expect(testDoubles.span.addEvent).toHaveBeenCalledWith("mcp.tool.failure", {
			"error.category": "UnknownError",
		});
		expect(testDoubles.toolErrorsAdd).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				tool_name: "NonErrorContext",
				error_type: "UNKNOWN_ERROR",
			}),
		);
		expect(testDoubles.span.end).toHaveBeenCalledOnce();
	});

	it("records allowlisted Hevy metadata without the raw error", async () => {
		const error = new HevyHttpError("private upstream message", {
			status: 503,
			method: "GET",
			endpoint: "/v1/user/info",
			code: "HEVY_RETRY_EXHAUSTED",
		});
		const handler = vi.fn().mockRejectedValue(error);

		await expect(withTelemetry(handler, "HevyContext")({})).rejects.toBe(error);
		expect(testDoubles.span.addEvent).toHaveBeenCalledWith("mcp.tool.failure", {
			"error.category": "HevyHttpError",
			"error.code": "HEVY_RETRY_EXHAUSTED",
			"http.status_code": 503,
			"http.method": "GET",
			"hevy.api.endpoint": "/v1/user/info",
		});
		expect(testDoubles.span.recordException).not.toHaveBeenCalled();
	});
});
