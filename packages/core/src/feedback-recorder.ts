export type FeedbackResult =
	| { readonly accepted: true }
	| {
			readonly accepted: false;
			readonly reason:
				| "telemetry_disabled"
				| "telemetry_unavailable"
				| "rejected";
	  };

export interface AgentFeedbackRecorder {
	record(message: string): FeedbackResult;
}

export function createUnavailableAgentFeedbackRecorder(): AgentFeedbackRecorder {
	return {
		record: () => ({ accepted: false, reason: "telemetry_unavailable" }),
	};
}
