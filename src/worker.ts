import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createSharedMcpServer } from "./shared-server.js";
import { isHevyHttpError } from "./utils/hevy-http-error.js";
import { createClient, type HevyClient } from "./utils/hevyClient.js";

const MCP_PATH = "/mcp";
const HEVY_API_BASE_URL = "https://api.hevyapp.com";
const AUTH_VALIDATION_TIMEOUT_MS = 5_000;
const CORS_ALLOWED_HEADERS =
	"Authorization, Content-Type, Accept, MCP-Protocol-Version";
const CORS_ALLOWED_METHODS = "POST, OPTIONS";

export interface WorkerEnv {
	MCP_ALLOWED_ORIGINS?: string;
}

interface WorkerDependencies {
	createValidationClient?: (apiKey: string) => HevyClient;
	createRequestClient?: (apiKey: string) => HevyClient;
	createServer?: (apiKey: string, hevyClient: HevyClient) => McpServer;
	createTransport?: () => WebStandardStreamableHTTPServerTransport;
}

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

function createDefaultValidationClient(apiKey: string): HevyClient {
	return createClient(apiKey, HEVY_API_BASE_URL, {
		maxGetRetries: 0,
		timeoutMs: AUTH_VALIDATION_TIMEOUT_MS,
	});
}

function createDefaultRequestClient(apiKey: string): HevyClient {
	return createClient(apiKey, HEVY_API_BASE_URL);
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

export function createWorkerHandler(dependencies: WorkerDependencies = {}) {
	const createValidationClient =
		dependencies.createValidationClient ?? createDefaultValidationClient;
	const createRequestClient =
		dependencies.createRequestClient ?? createDefaultRequestClient;
	const createServer = dependencies.createServer ?? createDefaultServer;
	const createTransport =
		dependencies.createTransport ?? createDefaultTransport;

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

		try {
			await createValidationClient(apiKey).getUserInfo();
		} catch (error) {
			if (
				isHevyHttpError(error) &&
				(error.status === 401 || error.status === 403)
			) {
				return response("Unauthorized", 401, origin, {
					"WWW-Authenticate": "Bearer",
				});
			}
			return response("Hevy API is temporarily unavailable", 502, origin);
		}

		try {
			const hevyClient = createRequestClient(apiKey);
			const server = createServer(apiKey, hevyClient);
			const transport = createTransport();
			transport.onerror = () => {
				console.error("Streamable HTTP transport error");
			};
			await server.connect(transport);
			const mcpResponse = await transport.handleRequest(request);
			return withCors(mcpResponse, origin);
		} catch {
			return response("Unable to process MCP request", 500, origin);
		}
	};
}

const handleRequest = createWorkerHandler();

export default {
	fetch(request: Request, env: WorkerEnv): Promise<Response> {
		return handleRequest(request, env);
	},
};
