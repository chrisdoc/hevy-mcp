// Import the Kubb-based client
import { createClient as createKubbClient } from "./hevyClientKubb.js";

export function createClient(apiKey: string, baseUrl: string) {
	return createKubbClient(apiKey, baseUrl);
}

// Export the HevyClient type for use in other modules
export type HevyClient = ReturnType<typeof createClient>;
