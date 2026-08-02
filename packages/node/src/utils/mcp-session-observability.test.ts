import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createMcpSessionContext,
	getCurrentMcpSessionId,
	recordMcpSessionStart,
	recordMcpSessionTermination,
	recordMcpToolFailure,
	recordMcpToolInvocation,
	resolveSessionTerminationCategory,
	runWithMcpSessionContext,
} from "./mcp-session-observability.js";

const testDoubles = vi.hoisted(() => ({
	sessionStartedAdd: vi.fn(),
	sessionEndedAdd: vi.fn(),
}));

vi.mock("./metrics.js", () => ({
	sessionStarted: { add: testDoubles.sessionStartedAdd },
	sessionEnded: { add: testDoubles.sessionEndedAdd },
}));

describe("MCP session tool observations", () => {
	beforeEach(() => {
		recordMcpSessionTermination("unknown");
		vi.clearAllMocks();
	});

	it("buckets observed calls and terminates failed sessions as tool failures", () => {
		recordMcpSessionStart({
			method: "initialize",
			params: {
				protocolVersion: "2025-11-25",
				clientInfo: { name: "Claude-Desktop", version: "1.2.3" },
			},
		});

		recordMcpToolInvocation();
		recordMcpToolFailure();

		expect(resolveSessionTerminationCategory(true)).toBe("tool_failure");
		recordMcpSessionTermination("tool_failure");
		expect(testDoubles.sessionEndedAdd).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				termination_category: "tool_failure",
				tool_calls_bucket: "1",
			}),
		);
	});
	it("isolates opaque IDs across sessions and propagates the active ID", () => {
		const first = createMcpSessionContext({ method: "initialize" }, "http", {
			telemetrySessionId: "session-one",
		});
		const second = createMcpSessionContext({ method: "initialize" }, "http", {
			telemetrySessionId: "session-two",
		});

		expect(first.telemetrySessionId).not.toBe(second.telemetrySessionId);
		expect(
			runWithMcpSessionContext(first, () => getCurrentMcpSessionId()),
		).toBe("session-one");
		expect(
			runWithMcpSessionContext(second, () => getCurrentMcpSessionId()),
		).toBe("session-two");
		runWithMcpSessionContext(first, () =>
			recordMcpSessionStart({}, "http", first),
		);
		expect(testDoubles.sessionStartedAdd.mock.calls.flat()).not.toContain(
			"session-one",
		);
	});
	it("keeps telemetry session IDs out of metric attributes", () => {
		const context = createMcpSessionContext(
			{
				method: "initialize",
				params: {
					protocolVersion: "2025-11-25",
					clientInfo: { name: "Private Client", version: "1.2.3" },
				},
			},
			"http",
			{ telemetrySessionId: "session-secret" },
		);

		runWithMcpSessionContext(context, () => {
			recordMcpSessionStart({}, "http", context);
			recordMcpSessionTermination("clean", context);
		});

		expect(
			JSON.stringify([
				testDoubles.sessionStartedAdd.mock.calls,
				testDoubles.sessionEndedAdd.mock.calls,
			]),
		).not.toContain("session-secret");
	});
	it("generates one injectable opaque ID per session", () => {
		const generate = vi.fn(() => "generated-session");
		const context = createMcpSessionContext({ method: "initialize" }, "stdio", {
			generateTelemetrySessionId: generate,
		});

		expect(context.telemetrySessionId).toBe("generated-session");
		expect(generate).toHaveBeenCalledOnce();
	});
});
