import { Effect } from "effect";
import { z } from "zod";
import type { CoreToolError } from "../effect-errors.js";
import {
	FEEDBACK_MAX_MESSAGE_LENGTH,
	FEEDBACK_TOOL_DESCRIPTION,
} from "../feedback-metadata.js";
import type { FeedbackResult } from "../feedback-recorder.js";
import { sanitizeDiagnosticText } from "../utils/sanitize-diagnostic-text.js";
import type {
	McpToolResponse,
	ResponseContract,
} from "../utils/response-contracts.js";
import type { InferToolParams } from "../utils/tool-helpers.js";
import type { ToolRuntime } from "./tool-runtime.js";

export {
	FEEDBACK_MAX_MESSAGE_LENGTH,
	FEEDBACK_TOOL_DESCRIPTION,
} from "../feedback-metadata.js";

export const feedbackInputSchema = {
	message: z
		.string()
		.trim()
		.min(1)
		.max(FEEDBACK_MAX_MESSAGE_LENGTH)
		.describe(
			"An agent-composed, privacy-safe issue report; do not include personal data or secrets.",
		),
} as const;

export const feedbackOutputSchema = z.discriminatedUnion("accepted", [
	z.object({ accepted: z.literal(true) }).strict(),
	z
		.object({
			accepted: z.literal(false),
			reason: z.enum([
				"telemetry_disabled",
				"telemetry_unavailable",
				"rejected",
			]),
		})
		.strict(),
]);

export const feedbackResponse: ResponseContract<FeedbackResult> = {
	render(data): McpToolResponse {
		const structuredContent = feedbackOutputSchema.parse(data);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(structuredContent),
				},
			],
			structuredContent,
		};
	},
};

type FeedbackParams = InferToolParams<typeof feedbackInputSchema>;

export const feedbackToolDefinition = {
	name: "feedback",
	description: FEEDBACK_TOOL_DESCRIPTION,
	inputSchema: feedbackInputSchema,
	outputSchema: feedbackOutputSchema,
	annotations: {
		title: "Report Feedback",
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	},
	responseContract: feedbackResponse,
	execute: (
		runtime: ToolRuntime,
		args: FeedbackParams,
	): Effect.Effect<FeedbackResult, CoreToolError, never> =>
		Effect.sync(() => {
			const scrubbedMessage = sanitizeDiagnosticText(
				args.message,
				FEEDBACK_MAX_MESSAGE_LENGTH,
			);
			if (scrubbedMessage.length === 0) {
				return { accepted: false, reason: "rejected" };
			}
			if (!runtime.feedbackRecorder) {
				return { accepted: false, reason: "telemetry_unavailable" };
			}
			try {
				return runtime.feedbackRecorder.record(scrubbedMessage);
			} catch {
				return { accepted: false, reason: "telemetry_unavailable" };
			}
		}),
} as const;
