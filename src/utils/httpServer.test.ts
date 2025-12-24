import { describe, expect, it } from "vitest";
import { createHttpServer } from "./httpServer.js";

describe("createHttpServer", () => {
	it("throws because HTTP transport is removed", () => {
		const call = () => createHttpServer();

		expect(call).toThrowError(/HTTP\/SSE transport has been removed/);
		expect(call).toThrowError(/use stdio instead of HTTP\/SSE/);
		expect(call).toThrowError(/migration-from-httpsse-transport/);
	});
});
