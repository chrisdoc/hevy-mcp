import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerFeedbackRecorder } from "./worker-feedback.js";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Worker feedback recorder", () => {
	it("sends a detached, scrubbed OTLP span to the shared collector", async () => {
		const fetcher = vi.fn<typeof fetch>(() =>
			Promise.resolve(new Response(null, { status: 200 })),
		);
		const recorder = createWorkerFeedbackRecorder("collector-token", fetcher);

		await expect(
			recorder.record("Issue with alice@example.com in create-workout"),
		).resolves.toEqual({ accepted: true });

		const [url, request] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://otel.chrisdoc.dev/v1/traces");
		expect(request).toMatchObject({
			method: "POST",
			headers: {
				Authorization: "Bearer collector-token",
				"Content-Type": "application/json",
			},
		});
		const requestBody = request?.body;
		expect(typeof requestBody).toBe("string");
		if (typeof requestBody !== "string") {
			throw new Error("Expected an OTLP JSON request body");
		}
		const body = JSON.parse(requestBody) as {
			resourceSpans: Array<{
				resource: { attributes: Array<{ key: string }> };
				scopeSpans: Array<{
					spans: Array<{
						traceId: string;
						spanId: string;
						name: string;
						attributes: Array<{
							key: string;
							value: { stringValue: string };
						}>;
					}>;
				}>;
			}>;
		};
		const resourceSpan = body.resourceSpans[0];
		const span = resourceSpan?.scopeSpans[0]?.spans[0];
		expect(span).toBeDefined();
		if (!resourceSpan || !span) throw new Error("Expected one OTLP span");
		expect(span).toMatchObject({ name: "hevy_mcp.feedback" });
		expect(span.traceId).toMatch(/^[0-9a-f]{32}$/u);
		expect(span.spanId).toMatch(/^[0-9a-f]{16}$/u);
		expect(span.attributes).toEqual([
			{
				key: "feedback.message",
				value: { stringValue: "Issue with [EMAIL_REDACTED] in create-workout" },
			},
			{ key: "feedback.source", value: { stringValue: "agent" } },
		]);
		expect(
			JSON.stringify({ resource: resourceSpan.resource, span }),
		).not.toMatch(/user|session|request|geo|baggage|ray_id/iu);
	});

	it("reports an unavailable collector without exposing the message", async () => {
		const fetcher = vi.fn<typeof fetch>(() =>
			Promise.resolve(new Response(null, { status: 503 })),
		);
		const recorder = createWorkerFeedbackRecorder("collector-token", fetcher);
		const rawMessage = "collector-failure-message-sentinel";

		const result = await recorder.record(rawMessage);
		expect(result).toEqual({
			accepted: false,
			reason: "telemetry_unavailable",
		});
		expect(fetcher.mock.calls[0]?.[1]?.body).toContain(rawMessage);
		expect(JSON.stringify(result)).not.toContain(rawMessage);
	});

	it("keeps feedback unavailable when the Worker collector secret is absent", async () => {
		const fetcher = vi.fn<typeof fetch>();
		const recorder = createWorkerFeedbackRecorder(undefined, fetcher);

		expect(await recorder.record("technical feedback")).toEqual({
			accepted: false,
			reason: "telemetry_unavailable",
		});
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("honors the project telemetry opt-out", async () => {
		const fetcher = vi.fn<typeof fetch>();
		const recorder = createWorkerFeedbackRecorder(
			"collector-token",
			fetcher,
			false,
		);

		expect(await recorder.record("technical feedback")).toEqual({
			accepted: false,
			reason: "telemetry_disabled",
		});
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("rejects text that becomes empty after sanitization", async () => {
		const fetcher = vi.fn<typeof fetch>(() =>
			Promise.resolve(new Response(null, { status: 200 })),
		);
		const recorder = createWorkerFeedbackRecorder("collector-token", fetcher);

		await expect(recorder.record("\u001b[31m\u001b[0m")).resolves.toEqual({
			accepted: false,
			reason: "rejected",
		});
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("does not expose collector response or transport errors", async () => {
		const rawMessage = "collector-transport-message-sentinel";
		const fetcher = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new Error(rawMessage));
		const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const recorder = createWorkerFeedbackRecorder("collector-token", fetcher);

		await expect(recorder.record(rawMessage)).resolves.toEqual({
			accepted: false,
			reason: "telemetry_unavailable",
		});
		expect(logSpy).not.toHaveBeenCalled();
	});
});
