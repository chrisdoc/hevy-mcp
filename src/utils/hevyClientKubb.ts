import {
	createHevyClient,
	type HevyClient,
	type HevyClientOptions as PackageHevyClientOptions,
	type HevyRequestOptions,
} from "@hevy-mcp/hevy-client";
import type { McpClientLogger } from "./mcp-client-logger.js";

export * from "@hevy-mcp/hevy-client";

export interface HevyClientOptions extends PackageHevyClientOptions {
	logger?: McpClientLogger;
}

/** @deprecated Use createHevyClient from @hevy-mcp/hevy-client. */
export function createClient(
	apiKey: string,
	baseUrl?: string,
	options: HevyClientOptions = {},
) {
	const { logger, ...clientOptions } = options;
	const client = createHevyClient({
		apiKey,
		baseUrl,
		...clientOptions,
		onLog: logger,
	});
	interface LegacyRequestOptions extends HevyRequestOptions {
		readonly url?: string;
	}
	const compatibilityClient = {
		...client,
		getUserInfo: (requestOptions: LegacyRequestOptions = {}) =>
			client.getUserInfo(requestOptions),
	};
	return compatibilityClient as HevyClient & typeof compatibilityClient;
}
