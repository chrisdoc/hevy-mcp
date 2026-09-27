import {
	FEEDBACK_MAX_MESSAGE_LENGTH,
	sanitizeDiagnosticText,
	type AgentFeedbackRecorder,
} from "@hevy-mcp/core";
import { Predicate } from "effect";

const OTLP_TRACES_ENDPOINT = "https://otel.chrisdoc.dev/v1/traces";
const FEEDBACK_SCOPE_NAME = "hevy-mcp.worker.feedback";
const OTLP_EXPORT_TIMEOUT_MS = 5_000;

interface OtlpStringAttribute {
	key: string;
	value: { stringValue: string };
}

interface OtlpFeedbackSpan {
	traceId: string;
	spanId: string;
	name: "hevy_mcp.feedback";
	kind: 1;
	startTimeUnixNano: string;
	endTimeUnixNano: string;
	attributes: readonly OtlpStringAttribute[];
}

interface OtlpFeedbackRequest {
	resourceSpans: readonly [
		{
			resource: { attributes: readonly OtlpStringAttribute[] };
			scopeSpans: readonly [
				{
					scope: { name: string };
					spans: readonly [OtlpFeedbackSpan];
				},
			];
		},
	];
}

/** Identify one feedback call so a recently validated key can report during an outage. */
export async function isFeedbackToolCall(request: Request): Promise<boolean> {
	if (!request.headers.get("content-type")?.includes("application/json")) {
		return false;
	}
	try {
		const payload: unknown = await request.clone().json();
		if (
			!Predicate.isObject(payload) ||
			payload.jsonrpc !== "2.0" ||
			payload.method !== "tools/call" ||
			(typeof payload.id !== "string" && typeof payload.id !== "number") ||
			!Predicate.isObject(payload.params)
		) {
			return false;
		}
		return payload.params.name === "feedback";
	} catch {
		return false;
	}
}

function randomHex(byteLength: number): string {
	const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
	if (bytes.every((byte) => byte === 0)) bytes[0] = 1;
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

function createOtlpRequest(message: string): OtlpFeedbackRequest {
	const timestamp = (BigInt(Date.now()) * 1_000_000n).toString();
	return {
		resourceSpans: [
			{
				resource: {
					attributes: [
						{
							key: "service.name",
							value: { stringValue: "hevy-mcp" },
						},
						{
							key: "service.runtime",
							value: { stringValue: "cloudflare-worker" },
						},
					],
				},
				scopeSpans: [
					{
						scope: { name: FEEDBACK_SCOPE_NAME },
						spans: [
							{
								traceId: randomHex(16),
								spanId: randomHex(8),
								name: "hevy_mcp.feedback",
								kind: 1,
								startTimeUnixNano: timestamp,
								endTimeUnixNano: timestamp,
								attributes: [
									{
										key: "feedback.message",
										value: { stringValue: message },
									},
									{
										key: "feedback.source",
										value: { stringValue: "agent" },
									},
								],
							},
						],
					},
				],
			},
		],
	};
}

/** Send feedback through the same OTLP collector as the Node runtime. */
export function createWorkerFeedbackRecorder(
	collectorToken: string | undefined,
	fetcher: typeof fetch = fetch,
	telemetryEnabled = true,
): AgentFeedbackRecorder {
	if (!telemetryEnabled) {
		return {
			record: () => ({ accepted: false, reason: "telemetry_disabled" }),
		};
	}

	const token = collectorToken?.trim();
	if (!token) {
		return {
			record: () => ({
				accepted: false,
				reason: "telemetry_unavailable",
			}),
		};
	}

	return {
		async record(message) {
			const scrubbedMessage = sanitizeDiagnosticText(
				message,
				FEEDBACK_MAX_MESSAGE_LENGTH,
			);
			if (!scrubbedMessage) {
				return { accepted: false, reason: "rejected" };
			}

			try {
				const response = await fetcher(OTLP_TRACES_ENDPOINT, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(createOtlpRequest(scrubbedMessage)),
					signal: AbortSignal.timeout(OTLP_EXPORT_TIMEOUT_MS),
				});
				return response.ok
					? { accepted: true }
					: { accepted: false, reason: "telemetry_unavailable" };
			} catch {
				return { accepted: false, reason: "telemetry_unavailable" };
			}
		},
	};
}
