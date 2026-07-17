import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createSharedMcpServer } from "./shared-server.js";
import { isHevyHttpError } from "./utils/hevy-http-error.js";
import { createClient, type HevyClient } from "./utils/hevyClient.js";
import { createSafeErrorDiagnostic } from "./utils/safe-error-diagnostic.js";
import {
	createHevyOAuthProvider,
	hasOAuthAccessTokenShape,
	type HevyApiKeyValidation,
	type HevyOAuthWorker,
	isOAuthEnabled,
} from "./worker-oauth.js";

const MCP_PATH = "/mcp";
const HEVY_API_BASE_URL = "https://api.hevyapp.com";
const AUTH_VALIDATION_TIMEOUT_MS = 5_000;
const CORS_ALLOWED_HEADERS =
	"Authorization, Content-Type, Accept, MCP-Protocol-Version";
const CORS_ALLOWED_METHODS = "POST, OPTIONS";

export interface WorkerEnv {
	// Trusted deployment/test binding; invalid values fail closed before auth.
	HEVY_API_BASE_URL?: string;
	MCP_ALLOWED_ORIGINS?: string;
	// Optional KV namespace binding. When present, the Worker additionally
	// exposes OAuth 2.1 endpoints for remote MCP clients such as Claude.ai.
	// When absent, behavior is identical to the pre-OAuth Worker.
	OAUTH_KV?: unknown;
}

interface WorkerDependencies {
	createValidationClient?: (apiKey: string, baseUrl: string) => HevyClient;
	createRequestClient?: (apiKey: string, baseUrl: string) => HevyClient;
	createServer?: (apiKey: string, hevyClient: HevyClient) => McpServer;
	createTransport?: () => WebStandardStreamableHTTPServerTransport;
}

type ResolvedWorkerDependencies = Required<WorkerDependencies>;

export function parseBearerApiKey(authorization: string | null): string | null {
	if (!authorization) return null;
	const match = /^Bearer ([^\s,]+)$/i.exec(authorization);
	return match?.[1] ?? null;
}

export function parseAllowedOrigins(value: string | undefined): Set<string> {
	return new Set(
		(value ?? "")
			.split(",")
			.map((origin) => origin.trim())
			.filter(Boolean),
	);
}

function corsHeaders(origin: string): Headers {
	return new Headers({
		"Access-Control-Allow-Origin": origin,
		Vary: "Origin",
	});
}

function withCors(response: Response, origin: string | null): Response {
	if (!origin) return response;
	const headers = new Headers(response.headers);
	for (const [key, value] of corsHeaders(origin)) headers.set(key, value);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function response(
	message: string,
	status: number,
	origin: string | null,
	headers?: Headers | Record<string, string>,
): Response {
	return withCors(new Response(message, { status, headers }), origin);
}

function validateOrigin(
	request: Request,
	env: WorkerEnv,
): string | null | Response {
	const origin = request.headers.get("origin");
	if (!origin) return null;
	if (!parseAllowedOrigins(env.MCP_ALLOWED_ORIGINS).has(origin)) {
		return new Response("Forbidden", {
			status: 403,
			headers: { Vary: "Origin" },
		});
	}
	return origin;
}

function resolveHevyApiBaseUrl(value: string | undefined): string {
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

function createDefaultValidationClient(
	apiKey: string,
	baseUrl: string,
): HevyClient {
	return createClient(apiKey, baseUrl, {
		maxGetRetries: 0,
		timeoutMs: AUTH_VALIDATION_TIMEOUT_MS,
	});
}

function createDefaultRequestClient(
	apiKey: string,
	baseUrl: string,
): HevyClient {
	return createClient(apiKey, baseUrl);
}

function createDefaultServer(
	apiKey: string,
	hevyClient: HevyClient,
): McpServer {
	return createSharedMcpServer({ apiKey, hevyClient });
}

function createDefaultTransport(): WebStandardStreamableHTTPServerTransport {
	return new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
	});
}

function logWorkerFailure(context: string, error: unknown): void {
	console.error("Cloudflare Worker failure", {
		context,
		...createSafeErrorDiagnostic(error),
	});
}

function resolveWorkerDependencies(
	dependencies: WorkerDependencies,
): ResolvedWorkerDependencies {
	return {
		createValidationClient:
			dependencies.createValidationClient ?? createDefaultValidationClient,
		createRequestClient:
			dependencies.createRequestClient ?? createDefaultRequestClient,
		createServer: dependencies.createServer ?? createDefaultServer,
		createTransport: dependencies.createTransport ?? createDefaultTransport,
	};
}

async function validateHevyApiKey(
	apiKey: string,
	hevyApiBaseUrl: string,
	createValidationClient: ResolvedWorkerDependencies["createValidationClient"],
): Promise<HevyApiKeyValidation> {
	try {
		await createValidationClient(apiKey, hevyApiBaseUrl).getUserInfo();
		return "valid";
	} catch (error) {
		if (
			isHevyHttpError(error) &&
			(error.status === 401 || error.status === 403)
		) {
			return "invalid";
		}
		return "unavailable";
	}
}

async function serveMcpRequest(
	request: Request,
	apiKey: string,
	hevyApiBaseUrl: string,
	dependencies: ResolvedWorkerDependencies,
): Promise<Response> {
	try {
		const hevyClient = dependencies.createRequestClient(apiKey, hevyApiBaseUrl);
		const server = dependencies.createServer(apiKey, hevyClient);
		const transport = dependencies.createTransport();
		transport.onerror = (error) => {
			logWorkerFailure("streamable-http-transport", error);
		};
		await server.connect(transport);
		return await transport.handleRequest(request);
	} catch (error) {
		logWorkerFailure("mcp-request-processing", error);
		return new Response("Unable to process MCP request", { status: 500 });
	}
}

export function createWorkerHandler(dependencies: WorkerDependencies = {}) {
	const resolved = resolveWorkerDependencies(dependencies);

	return async function handleRequest(
		request: Request,
		env: WorkerEnv,
	): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname !== MCP_PATH)
			return new Response("Not found", { status: 404 });

		const originResult = validateOrigin(request, env);
		if (originResult instanceof Response) return originResult;
		const origin = originResult;
		let hevyApiBaseUrl: string;
		try {
			hevyApiBaseUrl = resolveHevyApiBaseUrl(env.HEVY_API_BASE_URL);
		} catch {
			return response("Worker configuration error", 500, origin);
		}

		if (request.method === "OPTIONS") {
			const headers = origin ? corsHeaders(origin) : new Headers();
			headers.set("Access-Control-Allow-Methods", CORS_ALLOWED_METHODS);
			headers.set("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS);
			headers.set("Access-Control-Max-Age", "86400");
			return new Response(null, { status: 204, headers });
		}

		if (request.method !== "POST") {
			return response("Method not allowed", 405, origin, {
				Allow: CORS_ALLOWED_METHODS,
			});
		}

		const apiKey = parseBearerApiKey(request.headers.get("authorization"));
		if (!apiKey) {
			return response("Unauthorized", 401, origin, {
				"WWW-Authenticate": "Bearer",
			});
		}

		const validation = await validateHevyApiKey(
			apiKey,
			hevyApiBaseUrl,
			resolved.createValidationClient,
		);
		if (validation === "invalid") {
			return response("Unauthorized", 401, origin, {
				"WWW-Authenticate": "Bearer",
			});
		}
		if (validation !== "valid") {
			return response("Hevy API is temporarily unavailable", 502, origin);
		}

		return withCors(
			await serveMcpRequest(request, apiKey, hevyApiBaseUrl, resolved),
			origin,
		);
	};
}

function createWorkerOAuthProvider(
	resolved: ResolvedWorkerDependencies,
): HevyOAuthWorker<WorkerEnv> {
	return createHevyOAuthProvider<WorkerEnv>({
		validateApiKey: async (apiKey, env) => {
			let hevyApiBaseUrl: string;
			try {
				hevyApiBaseUrl = resolveHevyApiBaseUrl(env.HEVY_API_BASE_URL);
			} catch {
				return "config-error";
			}
			return validateHevyApiKey(
				apiKey,
				hevyApiBaseUrl,
				resolved.createValidationClient,
			);
		},
		serveMcp: async (request, env, apiKey) => {
			let hevyApiBaseUrl: string;
			try {
				hevyApiBaseUrl = resolveHevyApiBaseUrl(env.HEVY_API_BASE_URL);
			} catch {
				return new Response("Worker configuration error", { status: 500 });
			}
			return serveMcpRequest(request, apiKey, hevyApiBaseUrl, resolved);
		},
	});
}

/**
 * Compose the legacy direct-API-key handler with the optional OAuth layer.
 *
 * Without an `OAUTH_KV` binding every request takes the legacy path, so
 * existing deployments are unaffected. With the binding, `/mcp` requests
 * whose bearer value looks like an OAuth access token (and unauthenticated
 * ones, so clients receive the RFC 9728 discovery challenge) go through the
 * OAuth provider, while raw Hevy API keys keep using the legacy path.
 */
export function createWorkerFetchHandler(
	dependencies: WorkerDependencies = {},
) {
	const resolved = resolveWorkerDependencies(dependencies);
	const legacyHandler = createWorkerHandler(dependencies);
	const oauthProvider = createWorkerOAuthProvider(resolved);

	return async function handleWorkerFetch(
		request: Request,
		env: WorkerEnv,
		ctx?: object,
	): Promise<Response> {
		if (!isOAuthEnabled(env)) {
			if (env.OAUTH_KV != null) {
				logWorkerFailure(
					"oauth-kv-misconfigured",
					new TypeError(
						"OAUTH_KV binding is not a KV namespace; OAuth stays disabled",
					),
				);
			}
			return legacyHandler(request, env);
		}

		const url = new URL(request.url);
		if (url.pathname === MCP_PATH) {
			if (request.method !== "POST") return legacyHandler(request, env);
			const bearer = parseBearerApiKey(request.headers.get("authorization"));
			if (bearer && !hasOAuthAccessTokenShape(bearer)) {
				return legacyHandler(request, env);
			}
			const originResult = validateOrigin(request, env);
			if (originResult instanceof Response) return originResult;
			const oauthResponse = await oauthProvider.fetch(request, env, ctx ?? {});
			return withCors(oauthResponse, originResult);
		}
		return oauthProvider.fetch(request, env, ctx ?? {});
	};
}

const handleWorkerFetch = createWorkerFetchHandler();

export default {
	fetch(request: Request, env: WorkerEnv, ctx?: object): Promise<Response> {
		return handleWorkerFetch(request, env, ctx);
	},
};
