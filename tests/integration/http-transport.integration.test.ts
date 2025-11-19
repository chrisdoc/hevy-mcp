import { describe, expect, it } from "vitest";
import { createHttpServer } from "../../src/utils/httpServer.js";

describe("HTTP transport integration", () => {
	it("is no longer supported", () => {
		expect(() => createHttpServer()).toThrow(
			/HTTP transport mode has been removed/,
		);
	});
});
