import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	extractMcpClientMetadata,
	recordMcpSessionStart,
	recordMcpSessionTermination,
	recordMcpToolFailure,
	recordMcpToolInvocation,
} from "./mcp-session-observability.js";

const testDoubles = vi.hoisted(() => ({
	sessionStartedAdd: vi.fn(),
	sessionEndedAdd: vi.fn(),
}));

vi.mock("./metrics.js", () => ({
	sessionStarted: { add: testDoubles.sessionStartedAdd },
	sessionEnded: { add: testDoubles.sessionEndedAdd },
}));

describe("MCP session observability", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("keeps valid protocol client metadata bounded", () => {
		expect(
			extractMcpClientMetadata({
				method: "initialize",
				params: {
					protocolVersion: "2025-11-25",
					clientInfo: { name: "Claude-Desktop", version: "1.2.3" },
				},
			}),
		).toEqual({
			name: "Claude-Desktop",
			version: "1.2.3",
			protocolVersion: "2025-11-25",
		});
	});

	it("fails closed for missing or malformed metadata", () => {
		expect(extractMcpClientMetadata({ method: "initialize" })).toEqual({
			name: "unknown",
			version: "unknown",
			protocolVersion: "unknown",
		});
		expect(
			extractMcpClientMetadata({
				method: "initialize",
				params: {
					protocolVersion: "private\nprotocol",
					clientInfo: {
						name: "private client metadata",
						version: "x".repeat(65),
					},
				},
			}),
		).toEqual({
			name: "unknown",
			version: "unknown",
			protocolVersion: "unknown",
		});
	});

	it("records bounded session lifecycle and never uses a session id or user hash", () => {
		recordMcpSessionStart({
			method: "initialize",
			params: {
				protocolVersion: "2025-11-25",
				clientInfo: { name: "Claude-Desktop", version: "1.2.3" },
			},
		});
		recordMcpToolInvocation();
		recordMcpToolFailure();
		recordMcpSessionTermination("tool_failure");

		expect(testDoubles.sessionStartedAdd).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				client_name: "Claude-Desktop",
				client_version: "1.2.3",
				protocol_version: "2025-11-25",
				transport: "stdio",
			}),
		);
		expect(testDoubles.sessionEndedAdd).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				termination_category: "tool_failure",
				session_duration_bucket: expect.any(String),
				tool_calls_bucket: "1",
			}),
		);
		const serialized = JSON.stringify(testDoubles.sessionEndedAdd.mock.calls);
		expect(serialized).not.toContain("session_id");
		expect(serialized).not.toContain("user.hash");
	});
});
