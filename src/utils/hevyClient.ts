// Import the Kubb-based client
import { createClient as createKubbClient } from "./hevyClientKubb.js";
import type { HevyClientOptions } from "./hevyClientKubb.js";

export function createClient(
	apiKey: string,
	baseUrl: string,
	options: HevyClientOptions = {},
) {
	return createKubbClient(apiKey, baseUrl, options);
}

// Export the HevyClient type for use in other modules
export type HevyClient = ReturnType<typeof createClient>;
