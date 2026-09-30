/// <reference types="@cloudflare/workers-types" />

import { isOAuthEnabled } from "./worker-oauth.js";

const HEVY_API_BASE_URL = "https://api.hevyapp.com";
const OAUTH_AUTHORIZE_PATH = "/authorize";

export const DEFAULT_ALLOWED_ORIGINS = [
	"https://claude.ai", // Anthropic Claude web connector
	"https://www.claude.ai", // Anthropic Claude web connector
	"https://claude.com", // Anthropic Claude web connector
	"https://www.claude.com", // Anthropic Claude web connector
	"https://chatgpt.com", // OpenAI ChatGPT connectors
	"https://chat.openai.com", // Legacy ChatGPT web origin
	"https://vscode.dev", // VS Code for the Web
	"https://github.dev", // github.dev web editor
] as const;

export const CORS_ALLOWED_HEADERS =
	"Authorization, Content-Type, Accept, MCP-Protocol-Version";
export const CORS_ALLOWED_METHODS = "POST, OPTIONS";

export interface WorkerEnv {
	// Trusted deployment/test binding; invalid values fail closed before auth.
	HEVY_API_BASE_URL?: string;
	// Optional comma-separated exact-origin override. When omitted, the known
	// browser client origins above are allowed.
	MCP_ALLOWED_ORIGINS?: string;
	// Development-only escape hatch for local and preview browser clients.
	// Production deployments must leave this unset.
	MCP_DISABLE_ORIGIN_CHECK?: string;
	// Optional KV namespace binding. When present, the Worker additionally
	// exposes OAuth 2.1 endpoints for remote MCP clients such as Claude.ai.
	// When absent, behavior is identical to the pre-OAuth Worker.
	OAUTH_KV?: unknown;
	// Optional canonical MCP resource URL, including /mcp. Defaults to this
	// repository's production URL; set it for a fork's deployment.
	OAUTH_RESOURCE?: string;
	// Optional comma-separated retry delay sequence (ms) for validation backoff.
	// Defaults to 300,600.
	HEVY_VALIDATION_RETRY_DELAYS_MS?: string;
	// Cloudflare secret used to submit detached feedback spans to the OTLP collector.
	OTEL_COLLECTOR_TOKEN?: string;
	// Set to exactly "0" to disable project feedback telemetry.
	HEVY_MCP_TELEMETRY?: string;
}

export function parseBearerApiKey(authorization: string | null): string | null {
	if (!authorization) return null;
	const match = /^Bearer ([^\s,]+)$/i.exec(authorization);
	return match?.[1] ?? null;
}

export function parseAllowedOrigins(value: string | undefined): Set<string> {
	const origins =
		value === undefined ? DEFAULT_ALLOWED_ORIGINS : value.split(",");
	return new Set(origins.map((origin) => origin.trim()).filter(Boolean));
}

export function validateOrigin(
	request: Request,
	env: WorkerEnv,
): string | null | Response {
	const origin = request.headers.get("origin");
	const url = new URL(request.url);
	if (!origin) return null;
	if (
		origin === "null" &&
		request.method === "POST" &&
		url.pathname === OAUTH_AUTHORIZE_PATH &&
		isOAuthEnabled(env)
	) {
		// Sandboxed browser contexts submit OAuth consent forms with an opaque
		// origin. Keep this exception route-specific; never allow it for MCP.
		return origin;
	}
	if (env.MCP_DISABLE_ORIGIN_CHECK?.trim().toLowerCase() === "true") {
		return origin;
	}
	if (origin === url.origin) return origin;
	if (!parseAllowedOrigins(env.MCP_ALLOWED_ORIGINS).has(origin)) {
		console.warn({
			event: "worker.origin_rejected",
			requestId: request.headers.get("cf-ray") ?? null,
			method: request.method,
			path: url.pathname,
			origin,
		});
		return new Response("Forbidden", {
			status: 403,
			headers: { Vary: "Origin" },
		});
	}
	return origin;
}

export function corsHeaders(origin: string): Headers {
	return new Headers({
		"Access-Control-Allow-Origin": origin,
		Vary: "Origin",
	});
}

export function withCors(response: Response, origin: string | null): Response {
	if (!origin) return response;
	const headers = new Headers(response.headers);
	for (const [key, value] of corsHeaders(origin)) headers.set(key, value);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export function response(
	message: string,
	status: number,
	origin: string | null,
	headers?: Headers | Record<string, string>,
): Response {
	return withCors(new Response(message, { status, headers }), origin);
}

export function healthResponse(request: Request): Response {
	if (request.method === "OPTIONS") {
		return new Response(null, {
			status: 204,
			headers: {
				Allow: "GET, OPTIONS",
				"Access-Control-Allow-Methods": "GET, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type",
				"Access-Control-Max-Age": "86400",
			},
		});
	}
	if (request.method !== "GET") {
		return new Response("Method not allowed", {
			status: 405,
			headers: { Allow: "GET, OPTIONS" },
		});
	}
	return new Response(JSON.stringify({ status: "ok" }), {
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}

export function healthResponseWithCors(
	request: Request,
	env: WorkerEnv,
): Response {
	const origin = validateOrigin(request, env);
	return origin instanceof Response
		? origin
		: withCors(healthResponse(request), origin);
}

export function resolveHevyApiBaseUrl(value: string | undefined): string {
	if (value === undefined) return HEVY_API_BASE_URL;

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new TypeError("Invalid Hevy API base URL");
	}
	if (
		(url.protocol !== "http:" && url.protocol !== "https:") ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.pathname.replace(/\/+$/, "")
	) {
		throw new TypeError("Invalid Hevy API base URL");
	}
	return url.origin;
}
