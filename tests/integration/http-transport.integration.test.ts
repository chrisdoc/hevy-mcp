import { describe, expect, it } from "vitest";
import { createHttpServer } from "../../src/utils/httpServer.js";

describe("HTTP transport integration", () => {
	it("is no longer supported", () => {
		const call = () => createHttpServer();

		expect(call).toThrow(/HTTP\/SSE transport has been removed/);
		expect(call).toThrow(/use stdio instead of HTTP\/SSE/);
		expect(call).toThrow(/migration-from-httpsse-transport/);
	});
});
