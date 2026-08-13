import { z } from "zod";

const USER_HASH_CONTEXT = "hevy-mcp:sentry-user-id:v1";
const USER_HASH_LENGTH = 10;
const CLOUDFLARE_COLO_PATTERN = /^[A-Z]{3}$/u;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/u;
const GEO_VALUE_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .,'’()/_-]{0,63}$/u;
const IDENTIFIER_GEO_VALUE_PATTERN =
	/^(?:(?:\d{1,3}\.){3}\d{1,3}|-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)?|\d[\d -]*\d)$/u;
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

type MutableCloudflareGeography = {
	localityName?: string;
	localityRegion?: string;
	countryCode?: string;
};

/**
 * Sanitize a Cloudflare-provided locality or region without allowing
 * identifier-shaped values such as IP addresses, coordinates, or postal codes.
 */
export function sanitizeCloudflareGeographyValue(
	value: string | undefined,
): string | undefined {
	if (value === undefined || value.length > MAX_GEO_VALUE_LENGTH)
		return undefined;
	const normalized = value.trim().replace(/\s+/gu, " ");
	return normalized.length <= MAX_GEO_VALUE_LENGTH &&
		!IDENTIFIER_GEO_VALUE_PATTERN.test(normalized) &&
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
		const country = z.string().safeParse(cf?.country).data;
		const countryCode =
			country !== undefined && COUNTRY_CODE_PATTERN.test(country)
				? country
				: undefined;
		const localityName = sanitizeCloudflareGeographyValue(
			z.string().safeParse(cf?.city).data,
		);
		const localityRegion = sanitizeCloudflareGeographyValue(
			z.string().safeParse(cf?.region).data,
		);
		const geography: MutableCloudflareGeography = {};
		if (localityName) geography.localityName = localityName;
		if (localityRegion) geography.localityRegion = localityRegion;
		if (countryCode) geography.countryCode = countryCode;
		return geography;
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
		const parsedColo = z
			.string()
			.safeParse((request as RequestWithCloudflareProperties).cf?.colo).data;
		return parsedColo !== undefined && CLOUDFLARE_COLO_PATTERN.test(parsedColo)
			? parsedColo
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
