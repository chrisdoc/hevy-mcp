import { describe, expect, it } from "vitest";
import { createHttpServer } from "../../src/utils/httpServer.js";

describe("HTTP transport integration", () => {
	it("is no longer supported", () => {
		expect(() => createHttpServer()).toThrow(
			/HTTP\/SSE transport has been removed/,
		);
		expect(() => createHttpServer()).toThrow(
			/migration-from-httpsse-transport/,
		);
	});
});
