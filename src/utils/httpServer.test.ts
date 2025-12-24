import { describe, expect, it } from "vitest";
import { createHttpServer } from "./httpServer.js";

describe("createHttpServer", () => {
	it("throws because HTTP transport is removed", () => {
		expect(() => createHttpServer()).toThrowError(
			/HTTP\/SSE transport has been removed/,
		);
	});
});
