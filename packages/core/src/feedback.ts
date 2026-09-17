import { Effect } from "effect";
import { z } from "zod";
import type { CoreToolError } from "./effect-errors.js";
import type { FeedbackResult } from "./feedback-recorder.js";
export type {
	AgentFeedbackRecorder,
	FeedbackResult,
} from "./feedback-recorder.js";
export { createUnavailableAgentFeedbackRecorder } from "./feedback-recorder.js";
import { sanitizeDiagnosticText } from "./utils/sanitize-diagnostic-text.js";
import {
	defineStructuredResponseContract,
	type ResponseContract,
} from "./utils/response-contracts.js";
import type { InferToolParams } from "./utils/tool-helpers.js";
import type { ToolRuntime } from "./tools/tool-runtime.js";

export const FEEDBACK_MAX_MESSAGE_LENGTH = 2_000;

export const feedbackInputSchema = {
	message: z.string().trim().min(1).max(FEEDBACK_MAX_MESSAGE_LENGTH),
} as const;

export const FEEDBACK_TOOL_DESCRIPTION =
	"Report an issue or unexpected behavior encountered while using hevy-mcp. Briefly explain which tool was involved, what you expected, what actually happened, and any relevant technical steps to reproduce. This message is sent to maintainers through diagnostic telemetry. Never include personally identifiable information (PII), names, emails, usernames, account or record IDs, credentials, API keys, tokens, or personal health/fitness data. Do not copy conversation content, raw tool arguments/results, request/response bodies, or raw error messages/stacks. Describe the technical behavior in your own words and use placeholders instead of real user data. Omit any detail you are unsure is safe to share. Do not repeat a failed write just to reproduce an issue, repeatedly report the same incident, or report failures of this feedback tool itself.";

const feedbackOutputSchema = {
	accepted: z.boolean(),
	reason: z
		.enum(["telemetry_disabled", "telemetry_unavailable", "rejected"])
		.optional(),
} as const;

export const feedbackResponse: ResponseContract<FeedbackResult> =
	defineStructuredResponseContract({
		outputSchema: feedbackOutputSchema,
		normalize: (data) => data,
		legacyJson: (output) => output,
	});

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
			if (!runtime.feedbackRecorder) {
				return { accepted: false, reason: "telemetry_unavailable" };
			}
			const scrubbedMessage = sanitizeDiagnosticText(
				args.message,
				FEEDBACK_MAX_MESSAGE_LENGTH,
			);
			try {
				return runtime.feedbackRecorder.record(scrubbedMessage);
			} catch {
				return { accepted: false, reason: "telemetry_unavailable" };
			}
		}),
} as const;
