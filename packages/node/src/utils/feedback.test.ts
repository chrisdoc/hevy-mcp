import { ROOT_CONTEXT } from "@opentelemetry/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testDoubles = vi.hoisted(() => ({
	getTelemetryAvailability: vi.fn(),
	startSpan: vi.fn(),
	end: vi.fn(),
	isRecording: vi.fn(() => true),
}));

vi.mock("./telemetry.js", () => ({
	getTelemetryAvailability: testDoubles.getTelemetryAvailability,
	tracer: { startSpan: testDoubles.startSpan },
}));

import { createNodeFeedbackRecorder } from "./feedback.js";

const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

describe("Node feedback recorder", () => {
	beforeEach(() => {
		testDoubles.getTelemetryAvailability.mockReset();
		testDoubles.startSpan.mockReset();
		testDoubles.end.mockReset();
		testDoubles.isRecording.mockReset();
		testDoubles.isRecording.mockReturnValue(true);
	});
	afterEach(() => {
		expect(consoleLog).not.toHaveBeenCalled();
		expect(consoleError).not.toHaveBeenCalled();
		consoleLog.mockClear();
		consoleError.mockClear();
	});

	it("records only scrubbed feedback on a detached root span", () => {
		testDoubles.getTelemetryAvailability.mockReturnValue("available");
		testDoubles.startSpan.mockReturnValue({
			isRecording: testDoubles.isRecording,
			end: testDoubles.end,
		});

		const result = createNodeFeedbackRecorder().record(
			"scrubbed technical feedback",
		);

		expect(result).toEqual({ accepted: true });
		expect(testDoubles.startSpan).toHaveBeenCalledWith(
			"hevy_mcp.feedback",
			{
				root: true,
				attributes: {
					"feedback.message": "scrubbed technical feedback",
					"feedback.source": "agent",
				},
			},
			ROOT_CONTEXT,
		);
		expect(testDoubles.end).toHaveBeenCalledOnce();
		const attributes = testDoubles.startSpan.mock.calls[0]?.[1].attributes;
		expect(Object.keys(attributes)).toEqual([
			"feedback.message",
			"feedback.source",
		]);
		expect(JSON.stringify(attributes)).not.toMatch(
			/user|session|request|geo|baggage|api.?key/iu,
		);
	});

	it("redacts a configured nonstandard HOME before export", () => {
		testDoubles.getTelemetryAvailability.mockReturnValue("available");
		testDoubles.startSpan.mockReturnValue({
			isRecording: testDoubles.isRecording,
			end: testDoubles.end,
		});
		const originalHome = process.env.HOME;
		process.env.HOME = "/workspace/alice";

		try {
			const rawMessage =
				"feedback-raw-message-sentinel from /workspace/alice/project";
			expect(createNodeFeedbackRecorder().record(rawMessage)).toEqual({
				accepted: true,
			});
			const attributes = testDoubles.startSpan.mock.calls[0]?.[1].attributes;
			expect(attributes).toMatchObject({
				"feedback.message": "feedback-raw-message-sentinel from ~/project",
			});
			expect(JSON.stringify(attributes)).not.toContain("/workspace/alice");
		} finally {
			if (originalHome === undefined) delete process.env.HOME;
			else process.env.HOME = originalHome;
		}
	});

	it("redacts a Windows USERPROFILE when HOME is unavailable", () => {
		testDoubles.getTelemetryAvailability.mockReturnValue("available");
		testDoubles.startSpan.mockReturnValue({
			isRecording: testDoubles.isRecording,
			end: testDoubles.end,
		});
		const originalHome = process.env.HOME;
		const originalUserProfile = process.env.USERPROFILE;
		delete process.env.HOME;
		process.env.USERPROFILE = "C:\\Users\\Alice";

		try {
			expect(
				createNodeFeedbackRecorder().record(
					"feedback from C:\\Users\\Alice\\project",
				),
			).toEqual({ accepted: true });
			const attributes = testDoubles.startSpan.mock.calls[0]?.[1].attributes;
			expect(attributes).toMatchObject({
				"feedback.message": "feedback from ~\\project",
			});
		} finally {
			if (originalHome === undefined) delete process.env.HOME;
			else process.env.HOME = originalHome;
			if (originalUserProfile === undefined) delete process.env.USERPROFILE;
			else process.env.USERPROFILE = originalUserProfile;
		}
	});

	it.each(["telemetry_disabled", "telemetry_unavailable"] as const)(
		"returns %s without creating a span",
		(reason) => {
			testDoubles.getTelemetryAvailability.mockReturnValue(reason);

			expect(createNodeFeedbackRecorder().record("feedback")).toEqual({
				accepted: false,
				reason,
			});
			expect(testDoubles.startSpan).not.toHaveBeenCalled();
		},
	);

	it("returns telemetry_unavailable for non-recording or failing spans", () => {
		testDoubles.getTelemetryAvailability.mockReturnValue("available");
		testDoubles.startSpan.mockReturnValue({
			isRecording: testDoubles.isRecording,
			end: testDoubles.end,
		});
		testDoubles.isRecording.mockReturnValue(false);
		expect(createNodeFeedbackRecorder().record("feedback")).toEqual({
			accepted: false,
			reason: "telemetry_unavailable",
		});

		testDoubles.startSpan.mockImplementation(() => {
			throw new Error("export setup failed");
		});
		expect(createNodeFeedbackRecorder().record("feedback")).toEqual({
			accepted: false,
			reason: "telemetry_unavailable",
		});
	});
});
