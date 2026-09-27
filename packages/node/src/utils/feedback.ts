import { ROOT_CONTEXT } from "@opentelemetry/api";
import {
	FEEDBACK_MAX_MESSAGE_LENGTH,
	sanitizeDiagnosticText,
	type AgentFeedbackRecorder,
} from "@hevy-mcp/core";
import { getTelemetryAvailability, tracer } from "./telemetry.js";

/** Record feedback on a detached root span without request identity context. */
export function createNodeFeedbackRecorder(): AgentFeedbackRecorder {
	return {
		record(message) {
			const availability = getTelemetryAvailability();
			if (availability !== "available") {
				return { accepted: false, reason: availability };
			}

			try {
				const scrubbedMessage = sanitizeDiagnosticText(
					message,
					FEEDBACK_MAX_MESSAGE_LENGTH,
					process.env.HOME ?? process.env.USERPROFILE,
				);
				const span = tracer.startSpan(
					"hevy_mcp.feedback",
					{
						root: true,
						attributes: {
							"feedback.message": scrubbedMessage,
							"feedback.source": "agent",
						},
					},
					ROOT_CONTEXT,
				);
				if (!span.isRecording()) {
					return { accepted: false, reason: "telemetry_unavailable" };
				}
				span.end();
				return { accepted: true };
			} catch {
				return { accepted: false, reason: "telemetry_unavailable" };
			}
		},
	};
}
