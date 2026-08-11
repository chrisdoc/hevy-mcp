const USER_HASH_CONTEXT = "hevy-mcp:sentry-user-id:v1";
const USER_HASH_LENGTH = 10;
const CLOUDFLARE_COLO_PATTERN = /^[A-Z]{3}$/u;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/u;
const GEO_VALUE_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .,'’()/_-]{0,63}$/u;
const MAX_GEO_VALUE_LENGTH = 64;

type RequestWithCloudflareProperties = Request & {
	readonly cf?: {
		readonly colo?: unknown;
		readonly city?: unknown;
		readonly region?: unknown;
		readonly country?: unknown;
	};
};

export interface CloudflareGeography {
	readonly localityName?: string;
	readonly localityRegion?: string;
	readonly countryCode?: string;
}

function safeGeoValue(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim().replace(/\s+/gu, " ");
	return normalized.length <= MAX_GEO_VALUE_LENGTH &&
		GEO_VALUE_PATTERN.test(normalized)
		? normalized
		: undefined;
}

/**
 * Return bounded Cloudflare IP-geolocation fields. These values describe the
 * request's approximate location; they are not exact location data.
 */
export function getCloudflareGeography(request: Request): CloudflareGeography {
	try {
		const cf = (request as RequestWithCloudflareProperties).cf;
		const countryCode =
			typeof cf?.country === "string" && COUNTRY_CODE_PATTERN.test(cf.country)
				? cf.country
				: undefined;
		return {
			...(safeGeoValue(cf?.city)
				? { localityName: safeGeoValue(cf?.city) }
				: {}),
			...(safeGeoValue(cf?.region)
				? { localityRegion: safeGeoValue(cf?.region) }
				: {}),
			...(countryCode ? { countryCode } : {}),
		};
	} catch {
		// Request metadata is optional and must never affect MCP behavior.
		return {};
	}
}

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
