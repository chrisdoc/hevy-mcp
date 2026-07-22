import type {
	HevyClient,
	HevyClientOptions as PackageHevyClientOptions,
} from "@hevy-mcp/hevy-client";
import type { McpClientLogger } from "./mcp-client-logger.js";
import { createClient as createKubbClient } from "./hevyClientKubb.js";

export type { HevyClient };

export interface HevyClientOptions extends PackageHevyClientOptions {
	logger?: McpClientLogger;
}

/** @deprecated Use createHevyClient from @hevy-mcp/hevy-client. */
export function createClient(
	apiKey: string,
	baseUrl?: string,
	options: HevyClientOptions = {},
): HevyClient {
	return createKubbClient(apiKey, baseUrl, options);
}
