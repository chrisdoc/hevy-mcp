import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUserId } from "./telemetry.js";
import { withTelemetry } from "./telemetry-wrapper.js";

const testDoubles = vi.hoisted(() => ({
	span: {
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
	toolErrorsAdd: vi.fn(),
	toolDurationRecord: vi.fn(),
}));

vi.mock("./telemetry.js", () => ({
	tracer: { startActiveSpan: testDoubles.startActiveSpan },
	getCurrentUserId: vi.fn(() => undefined),
}));

vi.mock("./metrics.js", () => ({
	toolInvocations: { add: testDoubles.toolInvocationsAdd },
	toolErrors: { add: testDoubles.toolErrorsAdd },
	toolDuration: { record: testDoubles.toolDurationRecord },
}));

vi.mock("@opentelemetry/api", () => ({
	SpanStatusCode: { OK: 1, ERROR: 2 },
}));

describe("withTelemetry", () => {
	beforeEach(() => {
		delete process.env.HEVY_MCP_DEBUG;
		vi.clearAllMocks();
		vi.mocked(getCurrentUserId).mockReturnValue(undefined);
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
			page: 2,
			pageSize: 10,
			title: "Private Friday workout",
			apiKey: "secret-key",
			date: "2026-07-10",
			weightKg: 81.5,
			fatPercent: 18.2,
			waist: 84,
			workout: { notes: "personal notes", sets: 3 },
		};
		args.circular = args;

		await withTelemetry(handler, "create-body-measurement")(args);

		expect(handler).toHaveBeenCalledExactlyOnceWith(args);
		const output = String(stderrSpy.mock.calls[0]?.[0]);
		expect(output).toContain("[hevy-mcp:debug]");
		expect(output).toContain('"event":"tool_invocation"');
		expect(output).toContain('"tool":"create-body-measurement"');
		expect(output).toContain('"page":"[redacted]"');
		expect(output).toContain('"pageSize":"[redacted]"');
		expect(output).toContain('"weightKg":"[redacted]"');
		expect(output).toContain('"fatPercent":"[redacted]"');
		expect(output).toContain('"waist":"[redacted]"');
		expect(output).not.toContain("81.5");
		expect(output).not.toContain("18.2");
		expect(output).not.toContain("84");
		expect(output).not.toContain("2026-07-10");
		expect(output).not.toContain("Private Friday workout");
		expect(output).not.toContain("secret-key");
		expect(output).not.toContain("personal notes");
		expect(stdoutSpy).not.toHaveBeenCalled();
		stderrSpy.mockRestore();
		stdoutSpy.mockRestore();
	});

	it("records successful invocations and normalizes nullish arguments", async () => {
		const response = { content: [{ type: "text" as const, text: "Success" }] };
		const handler = vi.fn().mockResolvedValue(response);
		const wrapped = withTelemetry(handler, "TestContext");

		const result = await Reflect.apply(wrapped, undefined, [null]);

		expect(result).toBe(response);
		expect(handler).toHaveBeenCalledWith({});
		expect(testDoubles.toolInvocationsAdd).toHaveBeenCalledWith(1, {
			tool_name: "TestContext",
		});
		expect(testDoubles.startActiveSpan).toHaveBeenCalledWith(
			"mcp.tool.TestContext",
			{
				attributes: {
					"mcp.tool.name": "TestContext",
					"mcp.tool.args.key_count": 0,
					"mcp.tool.args.keys": "",
				},
			},
			expect.any(Function),
		);
		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({ code: 1 });
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.tool.result.is_error",
			false,
		);
		expect(testDoubles.toolDurationRecord).toHaveBeenCalledWith(
			expect.any(Number),
			{
				tool_name: "TestContext",
				is_error: "false",
			},
		);
		expect(testDoubles.span.end).toHaveBeenCalledOnce();
	});

	it("preserves safe argument ordering, scalar values, truncation, and user ID", async () => {
		vi.mocked(getCurrentUserId).mockReturnValue("user-123");
		const handler = vi.fn().mockResolvedValue({ content: [] });
		const longQuery = "a".repeat(120);

		await withTelemetry(
			handler,
			"ArgsContext",
		)({
			page: 2,
			privateNote: "hidden",
			pageSize: 10,
			query: longQuery,
			includeCustom: true,
			limit: null,
		});

		expect(testDoubles.startActiveSpan).toHaveBeenCalledWith(
			"mcp.tool.ArgsContext",
			{
				attributes: {
					"mcp.tool.name": "ArgsContext",
					"mcp.tool.args.key_count": 6,
					"mcp.tool.args.keys": "page,pageSize,query,includeCustom",
					"user.id": "user-123",
					"mcp.tool.args.page": 2,
					"mcp.tool.args.pageSize": 10,
					"mcp.tool.args.query": `${"a".repeat(100)}...`,
					"mcp.tool.args.includeCustom": true,
				},
			},
			expect.any(Function),
		);
	});

	it("records result error status and content attributes without toolErrors", async () => {
		const handler = vi.fn().mockResolvedValue({
			isError: true,
			content: [
				{ type: "text" as const, text: "Hello" },
				{ type: "text" as const, text: "World" },
			],
		});

		await withTelemetry(handler, "ReturnedErrorContext")({});

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
			"mcp.tool.result.text_length",
			10,
		);
		expect(testDoubles.toolErrorsAdd).not.toHaveBeenCalled();
		expect(testDoubles.toolDurationRecord).toHaveBeenCalledWith(
			expect.any(Number),
			{
				tool_name: "ReturnedErrorContext",
				is_error: "true",
			},
		);
		expect(testDoubles.span.end).toHaveBeenCalledOnce();
	});

	it("records thrown errors and rethrows the original value unchanged", async () => {
		const error = Object.assign(new Error("Something went wrong"), {
			code: "ERR_GENERIC",
		});
		const handler = vi.fn().mockRejectedValue(error);

		const promise = withTelemetry(handler, "ThrownErrorContext")({});

		await expect(promise).rejects.toBe(error);
		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({ code: 2 });
		expect(testDoubles.span.recordException).toHaveBeenCalledWith(error);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"error.type",
			"UNKNOWN_ERROR",
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"error.code",
			"ERR_GENERIC",
		);
		expect(testDoubles.toolErrorsAdd).toHaveBeenCalledWith(1, {
			tool_name: "ThrownErrorContext",
			error_type: "UNKNOWN_ERROR",
		});
		expect(testDoubles.toolDurationRecord).toHaveBeenCalledWith(
			expect.any(Number),
			{
				tool_name: "ThrownErrorContext",
				is_error: "true",
			},
		);
		expect(testDoubles.span.end).toHaveBeenCalledOnce();
	});

	it("records rejected non-Error values and rethrows them unchanged", async () => {
		const handler = vi.fn().mockRejectedValue("string failure");

		const promise = withTelemetry(handler, "NonErrorContext")({});

		await expect(promise).rejects.toBe("string failure");
		expect(testDoubles.span.recordException).toHaveBeenCalledWith(
			"string failure",
		);
		expect(testDoubles.toolErrorsAdd).toHaveBeenCalledWith(1, {
			tool_name: "NonErrorContext",
			error_type: "UNKNOWN_ERROR",
		});
		expect(testDoubles.span.end).toHaveBeenCalledOnce();
	});
});
