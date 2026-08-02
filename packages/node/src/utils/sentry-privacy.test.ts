import { describe, expect, it } from "vitest";
import { sanitizeSentryMcpSpan } from "./sentry-privacy.js";

describe("sanitizeSentryMcpSpan", () => {
	it("removes MCP session correlation without removing unrelated data", () => {
		const span = {
			data: {
				"mcp.session.id": "session-secret",
				"hevy.api.endpoint": "/v1/workouts",
			},
		};

		expect(sanitizeSentryMcpSpan(span)).toEqual({
			data: { "hevy.api.endpoint": "/v1/workouts" },
		});
	});
});
