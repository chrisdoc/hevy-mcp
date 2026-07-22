import { describe, expect, it, vi } from "vitest";
import { createHevyClient } from "./hevy-client.js";
import { HevyHttpError } from "./hevy-http-error.js";

function response(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("@hevy-mcp/hevy-client", () => {
	it("uses object-form options and safely encodes requests", async () => {
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const requestUrl =
					input instanceof Request
						? input.url
						: input instanceof URL
							? input.href
							: input;
				const url = new URL(requestUrl);
				expect(url.pathname).toBe("/v1/workouts");
				expect(url.searchParams.get("page")).toBe("2");
				expect(new Headers(init?.headers).get("api-key")).toBe("secret-key");
				return response({ page: 2 });
			},
		);

		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 0,
		});

		await expect(client.getWorkouts({ page: 2, pageSize: 5 })).resolves.toEqual(
			{
				page: 2,
			},
		);
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("emits bounded events without raw response or exception data", async () => {
		const onLog = vi.fn(() => {
			throw new Error("observer-secret");
		});
		const onRequestComplete = vi.fn(() => {
			throw new Error("completion-secret");
		});
		const fetchMock = vi
			.fn()
			.mockResolvedValue(response({ secret: "body" }, 401));
		const client = createHevyClient({
			apiKey: "api-key-secret",
			fetch: fetchMock,
			maxGetRetries: 0,
			onLog,
			onRequestComplete,
		});

		await expect(client.getUserInfo()).rejects.toBeInstanceOf(HevyHttpError);
		const eventText = JSON.stringify(onRequestComplete.mock.calls);
		expect(eventText).not.toContain("api-key-secret");
		expect(eventText).not.toContain("body");
		expect(eventText).not.toContain("observer-secret");
		expect(onLog).toHaveBeenCalled();
	});
});
