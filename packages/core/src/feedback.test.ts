import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	FEEDBACK_MAX_MESSAGE_LENGTH,
	createUnavailableAgentFeedbackRecorder,
	feedbackInputSchema,
	feedbackToolDefinition,
} from "./feedback.js";
import { createToolRuntime } from "./tools/tool-runtime.js";
import type { ExerciseTemplateCatalog } from "./utils/exercise-template-catalog.js";

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

async function executeFeedback(
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

	it("scrubs free text before recording without requiring a Hevy client", async () => {
		const record = vi.fn((message: string) => {
			void message;
			return { accepted: true as const };
		});
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
