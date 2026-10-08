import type { HevyClient } from "./hevy-client-contract.js";
import { createClient as createKubbClient } from "./hevy-client-kubb.js";
import type { HevyClientOptions } from "./hevy-client-kubb.js";
import { NATIVE_REQUEST_EFFECT } from "./internal-request-effect.js";

export type { HevyClient } from "./hevy-client-contract.js";
export type { HevyClientOptions };
export type { HevyRequestOptions } from "./execution.js";
export type { HevyOperationSafety } from "./execution.js";

export interface CreateHevyClientOptions extends HevyClientOptions {
	apiKey: string;
	baseUrl?: string;
}

export function createHevyClient({
	apiKey,
	baseUrl,
	...options
}: CreateHevyClientOptions): HevyClient {
	const { client, requestEffect } = createKubbClient(apiKey, baseUrl, options);
	Object.defineProperty(client, NATIVE_REQUEST_EFFECT, {
		configurable: false,
		enumerable: false,
		value: requestEffect,
		writable: false,
	});
	return client;
}
