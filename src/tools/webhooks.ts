import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { webhookRequestBodySchema } from "../generated/client/schemas/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import {
	createEmptyResponse,
	createJsonResponse,
} from "../utils/response-formatter.js";

type HevyClient = ReturnType<
	typeof import("../utils/hevyClientKubb.js").createClient
>;

// Enhanced webhook URL validation
const webhookUrlSchema = z
	.string()
	.url()
	.refine(
		(url) => {
			try {
				const parsed = new URL(url);
				return parsed.protocol === "https:" || parsed.protocol === "http:";
			} catch {
				return false;
			}
		},
		{
			message: "Webhook URL must be a valid HTTP or HTTPS URL",
		},
	)
	.refine(
		(url) => {
			try {
				const parsed = new URL(url);
				return (
					parsed.hostname !== "localhost" && !parsed.hostname.startsWith("127.")
				);
			} catch {
				return false;
			}
		},
		{
			message: "Webhook URL cannot be localhost or loopback address",
		},
	);

export function registerWebhookTools(
	server: McpServer,
	hevyClient: HevyClient,
) {
	// Get webhook subscription
	server.tool(
		"get-webhook-subscription",
		"Get the current webhook subscription for this account. Returns the webhook URL and auth token if a subscription exists.",
		{},
		withErrorHandling(async () => {
			const data = await hevyClient.getWebhookSubscription();
			if (!data) {
				return createEmptyResponse(
					"No webhook subscription found for this account",
				);
			}
			return createJsonResponse(data);
		}, "get-webhook-subscription"),
	);

	// Create webhook subscription
	server.tool(
		"create-webhook-subscription",
		"Create a new webhook subscription for this account. The webhook will receive POST requests when workouts are created. Your endpoint must respond with 200 OK within 5 seconds.",
		{
			url: webhookUrlSchema.describe(
				"The webhook URL that will receive POST requests when workouts are created",
			),
			authToken: z
				.string()
				.optional()
				.describe(
					"Optional auth token that will be sent as Authorization header in webhook requests",
				),
		},
		withErrorHandling(async ({ url, authToken }) => {
			// Validate the request body using the generated schema
			const requestBody = webhookRequestBodySchema.parse({
				url,
				authToken,
			});

			const data = await hevyClient.createWebhookSubscription(requestBody);
			if (!data) {
				return createEmptyResponse(
					"Failed to create webhook subscription - please check your URL and try again",
				);
			}
			return createJsonResponse(data);
		}, "create-webhook-subscription"),
	);

	// Delete webhook subscription
	server.tool(
		"delete-webhook-subscription",
		"Delete the current webhook subscription for this account. This will stop all webhook notifications.",
		{},
		withErrorHandling(async () => {
			const data = await hevyClient.deleteWebhookSubscription();
			if (!data) {
				return createEmptyResponse(
					"Failed to delete webhook subscription - no subscription may exist or there was a server error",
				);
			}
			return createJsonResponse(data);
		}, "delete-webhook-subscription"),
	);
}
