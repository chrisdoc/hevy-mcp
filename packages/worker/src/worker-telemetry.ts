const USER_HASH_CONTEXT = "hevy-mcp:sentry-user-id:v1";
const USER_HASH_LENGTH = 10;
const CLOUDFLARE_COLO_PATTERN = /^[A-Z]{3}$/u;

type RequestWithCloudflareProperties = Request & {
	readonly cf?: {
		readonly colo?: unknown;
	};
};

/**
 * Return the Cloudflare edge colo only when the Worker supplied a valid value.
 * Local Requests do not have `cf`, so they deliberately produce no colo.
 */
export function getCloudflareColo(request: Request): string | undefined {
	try {
		const colo = (request as RequestWithCloudflareProperties).cf?.colo;
		return typeof colo === "string" && CLOUDFLARE_COLO_PATTERN.test(colo)
			? colo
			: undefined;
	} catch {
		// Request metadata is optional and must never affect MCP behavior.
		return undefined;
	}
}

/**
 * Derive the same short, deterministic HMAC pseudonym used by the Node
 * telemetry path without exporting or logging the caller's Hevy API key.
 */
export async function createWorkerUserHash(
	apiKey: string,
): Promise<string | undefined> {
	if (apiKey.length === 0) return undefined;
	try {
		const encoder = new TextEncoder();
		const key = await crypto.subtle.importKey(
			"raw",
			encoder.encode(apiKey),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		const signature = await crypto.subtle.sign(
			"HMAC",
			key,
			encoder.encode(USER_HASH_CONTEXT),
		);
		return Array.from(new Uint8Array(signature), (byte) =>
			byte.toString(16).padStart(2, "0"),
		)
			.join("")
			.slice(0, USER_HASH_LENGTH);
	} catch {
		// Telemetry enrichment must never make an authenticated request fail.
		return undefined;
	}
}
