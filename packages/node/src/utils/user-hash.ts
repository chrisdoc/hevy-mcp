import { createHmac } from "node:crypto";

import { USER_HASH_CONTEXT, USER_HASH_LENGTH } from "@hevy-mcp/core";

/**
 * Derive the short, deterministic HMAC pseudonym shared with the Worker
 * telemetry contract without exporting or logging the caller's Hevy API key.
 */
export function createNodeUserHash(apiKey: string): string | undefined {
	if (apiKey.length === 0) return undefined;
	try {
		return createHmac("sha256", apiKey)
			.update(USER_HASH_CONTEXT, "utf8")
			.digest("hex")
			.slice(0, USER_HASH_LENGTH);
	} catch {
		// Telemetry enrichment must never make an authenticated request fail.
		return undefined;
	}
}
