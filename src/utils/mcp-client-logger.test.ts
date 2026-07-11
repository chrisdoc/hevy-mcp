import { afterEach, describe, expect, it, vi } from "vitest";
import { createMcpClientLogger } from "./mcp-client-logger.js";

const message = {
	level: "info" as const,
	logger: "hevy-cache",
	data: { message: "Catalog refreshed", count: 2 },
};

describe("createMcpClientLogger", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("sends the exact structured message when connected", () => {
		const sendLoggingMessage = vi.fn().mockResolvedValue(undefined);
		const logger = createMcpClientLogger({
			isConnected: () => true,
			sendLoggingMessage,
		});

		logger(message);

		expect(sendLoggingMessage).toHaveBeenCalledWith(message);
	});

	it("checks connection state at call time and skips disconnected sends", () => {
		const sendLoggingMessage = vi.fn().mockResolvedValue(undefined);
		const isConnected = vi.fn().mockReturnValue(false);
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const logger = createMcpClientLogger({
			isConnected,
			sendLoggingMessage,
		});

		logger(message);

		expect(isConnected).toHaveBeenCalledOnce();
		expect(sendLoggingMessage).not.toHaveBeenCalled();
		expect(errorSpy).toHaveBeenCalledWith(
			"Skipped structured MCP client log because the server is not connected",
		);
	});

	it("reports rejected sends to stderr without rejecting the caller", async () => {
		const secret = "sentinel-rejected-send";
		const sendError = new Error(secret);
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const logger = createMcpClientLogger({
			isConnected: () => true,
			sendLoggingMessage: vi.fn().mockRejectedValue(sendError),
		});

		expect(() => logger(message)).not.toThrow();
		await Promise.resolve();

		expect(errorSpy).toHaveBeenCalledWith(
			"Failed to send structured log message to MCP client",
			{ category: "Error" },
		);
		expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(secret);
	});

	it("reports synchronous server failures without throwing", () => {
		const secret = "sentinel-connection-check";
		const connectionError = new Error(secret);
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const logger = createMcpClientLogger({
			isConnected: () => {
				throw connectionError;
			},
			sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
		});

		expect(() => logger(message)).not.toThrow();
		expect(errorSpy).toHaveBeenCalledWith(
			"Failed to send structured log message to MCP client",
			{ category: "Error" },
		);
		expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(secret);
	});
});
