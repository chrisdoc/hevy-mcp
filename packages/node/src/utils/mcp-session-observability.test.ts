import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	recordMcpSessionStart,
	recordMcpSessionTermination,
	recordMcpToolFailure,
	recordMcpToolInvocation,
	resolveSessionTerminationCategory,
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
});
