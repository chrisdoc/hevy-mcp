import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	FEEDBACK_MAX_MESSAGE_LENGTH,
	feedbackInputSchema,
	feedbackOutputSchema,
	feedbackResponse,
	feedbackToolDefinition,
} from "./feedback.js";
import { createUnavailableAgentFeedbackRecorder } from "../feedback-recorder.js";
import { createToolRuntime } from "./tool-runtime.js";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import { sanitizeDiagnosticText } from "../utils/sanitize-diagnostic-text.js";

const catalog: ExerciseTemplateCatalog = {
	effect: () => Effect.succeed([]),
	get: () => Promise.resolve([]),
	reset: () => Effect.void,
	close: () => Effect.void,
};

function parseFeedback(input: Readonly<Record<string, string>>): {
	message: string;
} {
	return z.strictObject(feedbackInputSchema).parse(input);
}

function executeFeedback(
	message: string,
	feedbackRecorder?: Parameters<
		typeof createToolRuntime
	>[0]["feedbackRecorder"],
) {
	const runtime = createToolRuntime({
		client: null,
		catalog,
		feedbackRecorder,
	});
	return Effect.runPromise(
		feedbackToolDefinition.execute(runtime, parseFeedback({ message })),
	);
}

describe("feedback contract", () => {
	it("trims bounded input and rejects unknown, empty, and oversized fields", () => {
		expect(parseFeedback({ message: "  useful feedback  " })).toEqual({
			message: "useful feedback",
		});
		expect(() => parseFeedback({ message: "   " })).toThrow();
		expect(() =>
			parseFeedback({ message: "x".repeat(FEEDBACK_MAX_MESSAGE_LENGTH + 1) }),
		).toThrow();
		expect(() =>
			parseFeedback({ message: "valid", extra: "not allowed" }),
		).toThrow();
	});

	it("uses a discriminated output schema that rejects invalid combinations", () => {
		expect(feedbackOutputSchema.safeParse({ accepted: true }).success).toBe(
			true,
		);
		expect(
			feedbackOutputSchema.safeParse({
				accepted: false,
				reason: "rejected",
			}).success,
		).toBe(true);
		expect(
			feedbackOutputSchema.safeParse({
				accepted: true,
				reason: "rejected",
			}).success,
		).toBe(false);
		expect(feedbackOutputSchema.safeParse({ accepted: false }).success).toBe(
			false,
		);
		expect(() =>
			feedbackResponse.render({ accepted: true, reason: "rejected" } as never),
		).toThrow();
	});

	it("scrubs free text before recording without requiring a Hevy client", async () => {
		const record = vi.fn((_message: string) => ({ accepted: true as const }));
		const result = await executeFeedback(
			"  jane@example.com reported https://example.test/path  ",
			{ record },
		);

		expect(result).toEqual({ accepted: true });
		expect(record).toHaveBeenCalledOnce();
		const [message] = record.mock.calls[0] ?? [];
		expect(message).toBeTypeOf("string");
		expect(message).not.toContain("jane@example.com");
		expect(message).not.toContain("https://example.test");
	});

	it("redacts generic URLs, labeled secrets, Unicode emails, and Windows home paths", async () => {
		const record = vi.fn((_message: string) => ({ accepted: true as const }));
		await expect(
			executeFeedback(
				"ftp://user:secret@example.test/file client_secret=client-value access_token=access-value refresh_token=refresh-value 用户@example.com alice@例子.公司 C:\\\\Users\\\\Alice\\\\project",
				{ record },
			),
		).resolves.toEqual({ accepted: true });

		const [message] = record.mock.calls[0] ?? [];
		expect(message).toBeTypeOf("string");
		expect(message).toContain("[URL]");
		expect(message).toContain("~\\\\project");
		expect(message).not.toMatch(
			/client-value|access-value|refresh-value|用户@example\.com|alice@例子\.公司|ftp:\/\//u,
		);
	});

	it("rejects a message that becomes empty after sanitization", async () => {
		const record = vi.fn((_message: string) => ({ accepted: true as const }));

		await expect(
			executeFeedback("\u001b[31m\u001b[0m", { record }),
		).resolves.toEqual({ accepted: false, reason: "rejected" });
		expect(record).not.toHaveBeenCalled();
	});

	it("redacts bounded Unicode-aware email addresses", () => {
		expect(
			sanitizeDiagnosticText(
				"jane@example.com 用户@example.com alice@例子.公司",
			),
		).toBe("[EMAIL_REDACTED] [EMAIL_REDACTED] [EMAIL_REDACTED]");
		expect(
			sanitizeDiagnosticText("ordinary prose with @ and example.com"),
		).toBe("ordinary prose with @ and example.com");
	});

	it.each([
		["disabled", { accepted: false, reason: "telemetry_disabled" }],
		["unavailable", { accepted: false, reason: "telemetry_unavailable" }],
		["rejected", { accepted: false, reason: "rejected" }],
	] as const)(
		"returns a recorder result when telemetry is %s",
		async (_label, expected) => {
			await expect(
				executeFeedback("technical feedback", {
					record: () => expected,
				}),
			).resolves.toEqual(expected);
		},
	);

	it("returns telemetry_unavailable when no recorder or a recorder failure exists", async () => {
		await expect(executeFeedback("technical feedback")).resolves.toEqual({
			accepted: false,
			reason: "telemetry_unavailable",
		});
		await expect(
			executeFeedback("raw message must not escape", {
				record: () => {
					throw new Error("export failed");
				},
			}),
		).resolves.toEqual({
			accepted: false,
			reason: "telemetry_unavailable",
		});
	});

	it("provides an explicitly unavailable recorder for unsupported runtimes", () => {
		expect(createUnavailableAgentFeedbackRecorder().record("feedback")).toEqual(
			{
				accepted: false,
				reason: "telemetry_unavailable",
			},
		);
	});
});
