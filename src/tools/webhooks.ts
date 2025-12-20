import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withErrorHandling } from "../utils/error-handler.js";
import {
	createEmptyResponse,
	createJsonResponse,
} from "../utils/response-formatter.js";
import type { InferToolParams } from "../utils/tool-helpers.js";

type HevyClient = ReturnType<
	typeof import("../utils/hevyClientKubb.js").createClient
> & {
	getWebhookSubscription?: () => Promise<unknown>;
	createWebhookSubscription?: (data: {
		webhook: {
			url: string;
			authToken: string | null;
		};
	}) => Promise<unknown>;
	deleteWebhookSubscription?: () => Promise<unknown>;
};

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
	hevyClient: HevyClient | null,
) {
	// Get webhook subscription
	const getWebhookSubscriptionSchema = {} as const;
	type GetWebhookSubscriptionParams = InferToolParams<
		typeof getWebhookSubscriptionSchema
	>;

	server.tool(
		"get-webhook-subscription",
		"Get the current webhook subscription for this account. Returns the webhook URL and auth token if a subscription exists.",
		getWebhookSubscriptionSchema,
		withErrorHandling(async (_args: GetWebhookSubscriptionParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			if (!hevyClient.getWebhookSubscription) {
				throw new Error(
					"Webhook subscription API not available. Please regenerate the client from the updated OpenAPI spec.",
				);
			}
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
	const createWebhookSubscriptionSchema = {
		url: webhookUrlSchema.describe(
			"The webhook URL that will receive POST requests when workouts are created",
		),
		authToken: z
			.string()
			.optional()
			.describe(
				"Optional auth token that will be sent as Authorization header in webhook requests",
			),
	} as const;
	type CreateWebhookSubscriptionParams = InferToolParams<
		typeof createWebhookSubscriptionSchema
	>;

	server.tool(
		"create-webhook-subscription",
		"Create a new webhook subscription for this account. The webhook will receive POST requests when workouts are created. Your endpoint must respond with 200 OK within 5 seconds.",
		createWebhookSubscriptionSchema,
		withErrorHandling(async (args: CreateWebhookSubscriptionParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			const { url, authToken } = args;
			if (!hevyClient.createWebhookSubscription) {
				throw new Error(
					"Webhook subscription API not available. Please regenerate the client from the updated OpenAPI spec.",
				);
			}
			const data = await hevyClient.createWebhookSubscription({
				webhook: {
					url,
					authToken: authToken || null,
				},
			});
			if (!data) {
				return createEmptyResponse(
					"Failed to create webhook subscription - please check your URL and try again",
				);
			}
			return createJsonResponse(data);
		}, "create-webhook-subscription"),
	);

	// Delete webhook subscription
	const deleteWebhookSubscriptionSchema = {} as const;
	type DeleteWebhookSubscriptionParams = InferToolParams<
		typeof deleteWebhookSubscriptionSchema
	>;

	server.tool(
		"delete-webhook-subscription",
		"Delete the current webhook subscription for this account. This will stop all webhook notifications.",
		deleteWebhookSubscriptionSchema,
		withErrorHandling(async (_args: DeleteWebhookSubscriptionParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			if (!hevyClient.deleteWebhookSubscription) {
				throw new Error(
					"Webhook subscription API not available. Please regenerate the client from the updated OpenAPI spec.",
				);
			}
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
