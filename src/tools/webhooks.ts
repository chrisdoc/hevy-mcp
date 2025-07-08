import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PostV1WebhookSubscriptionMutationRequest } from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import {
	createEmptyResponse,
	createJsonResponse,
} from "../utils/response-formatter.js";

type HevyClient = ReturnType<
	typeof import("../utils/hevyClientKubb.js").createClient
>;

export function registerWebhookTools(
	server: McpServer,
	hevyClient: HevyClient,
) {
	// Get webhook subscription
	server.tool(
		"get-webhook-subscription",
		"Get the current webhook subscription for this account.",
		{},
		withErrorHandling(async () => {
			const data = await hevyClient.getWebhookSubscription();
			if (!data) {
				return createEmptyResponse("No webhook subscription found");
			}
			return createJsonResponse(data);
		}, "get-webhook-subscription"),
	);

	// Create webhook subscription
	server.tool(
		"create-webhook-subscription",
		"Create a new webhook subscription for this account.",
		{
			url: z.string().url(),
			events: z.array(z.string()),
		},
		withErrorHandling(async ({ url, events }) => {
			const data = await hevyClient.createWebhookSubscription({
				webhook: {
					url,
					events,
				},
			} as PostV1WebhookSubscriptionMutationRequest);
			if (!data) {
				return createEmptyResponse("Failed to create webhook subscription");
			}
			return createJsonResponse(data);
		}, "create-webhook-subscription"),
	);

	// Delete webhook subscription
	server.tool(
		"delete-webhook-subscription",
		"Delete the current webhook subscription for this account.",
		{},
		withErrorHandling(async () => {
			const data = await hevyClient.deleteWebhookSubscription();
			if (!data) {
				return createEmptyResponse("Failed to delete webhook subscription");
			}
			return createJsonResponse(data);
		}, "delete-webhook-subscription"),
	);
}
