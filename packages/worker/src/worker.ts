/// <reference types="@cloudflare/workers-types" />

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
	createHevyMcpServer,
	createSafeErrorDiagnostic,
	formatSafeErrorLogMessage,
	isClientTransportError,
	preloadHevyToolSchemas,
	type CreateHevyMcpServerOptions,
	type HevyClientFactoryContext,
} from "@hevy-mcp/core";
import { createHevyClient, type HevyClient } from "@hevy-mcp/hevy-client";
import {
	createHevyOAuthProvider,
	hasOAuthAccessTokenFormat,
	type HevyApiKeyValidation,
	type HevyOAuthWorker,
	isOAuthEnabled,
	WORKER_INVOCATION_TIMEOUT_MS,
} from "./worker-oauth.js";
import { executionResponse } from "./execution-response.js";
import {
	createWorkerToolObserver,
	type WorkerToolObserverOptions,
} from "./worker-observer.js";
import {
	createWorkerUserHash,
	getCloudflareColo,
	getCloudflareGeography,
} from "./worker-telemetry.js";
import {
	createWorkerFeedbackRecorder,
	isFeedbackToolCall,
} from "./worker-feedback.js";
import {
	hasCachedValidation,
	validateHevyApiKey,
	validateHevyApiKeyResilient,
	WORKER_VALIDATION_TIMEOUT_MS,
} from "./validation-cache.js";

import {
	CORS_ALLOWED_HEADERS,
	CORS_ALLOWED_METHODS,
	corsHeaders,
	DEFAULT_ALLOWED_ORIGINS,
	healthResponseWithCors,
	parseAllowedOrigins,
	parseBearerApiKey,
	resolveHevyApiBaseUrl,
	response,
	validateOrigin,
	withCors,
	type WorkerEnv,
} from "./worker-http-helpers.js";

export {
	DEFAULT_ALLOWED_ORIGINS,
	parseAllowedOrigins,
	parseBearerApiKey,
	type WorkerEnv,
};

const MCP_PATH = "/mcp";
const HEALTH_PATH = "/health";

/**
 * Warm the tool-schema memo at module scope so the per-isolate conversion
 * cost runs during isolate warm-up instead of inside a request's billed CPU.
 * See `preloadHevyToolSchemas` in packages/core. Client requests stay within
 * the Worker CPU budget by reusing the memoized tool schemas.
 */
preloadHevyToolSchemas();

class FallbackSpan implements Span {
	get isTraced(): boolean {
		return false;
	}

	setAttribute(_key: string, _value: boolean | number | string): this {
		return this;
	}

	setAttributes(
		_attributes: Record<string, boolean | number | string | undefined>,
	): this {
		return this;
	}

	recordException(
		_exception:
			| string
			| {
					code: string | number;
					name?: string;
					message?: string;
					stack?: string;
			  }
			| {
					code?: string | number;
					name: string;
					message?: string;
					stack?: string;
			  }
			| {
					code?: string | number;
					name?: string;
					message: string;
					stack?: string;
			  },
	): void {}

	updateName(_name: string): this {
		return this;
	}

	setStatus(_status: TracingSpanStatus): this {
		return this;
	}

	end(): void {}
}

const FALLBACK_EXECUTION_CONTEXT = {
	waitUntil(_promise: Promise<unknown>): void {},
	passThroughOnException(): void {},
	abort(_reason?: string): void {},
	exports: {},
	props: {},
	tracing: {
		enterSpan<T, A extends unknown[]>(
			_name: string,
			callback: (span: Span, ...args: A) => T,
			...args: A
		): T {
			return callback(new FallbackSpan(), ...args);
		},
		startActiveSpan<T, A extends unknown[]>(
			_name: string,
			callback: (span: Span, ...args: A) => T,
			...args: A
		): T {
			return callback(new FallbackSpan(), ...args);
		},
		startSpan(_name: string): Span {
			return new FallbackSpan();
		},
		getActiveSpan(): Span | undefined {
			return undefined;
		},
		Span: FallbackSpan,
	},
} satisfies ExecutionContext;

function requireExecutionContext(
	context: ExecutionContext | undefined,
): ExecutionContext {
	return context ?? FALLBACK_EXECUTION_CONTEXT;
}

interface WorkerDependencies {
	createValidationClient?: (apiKey: string, baseUrl: string) => HevyClient;
	createRequestClient?: (
		apiKey: string,
		baseUrl: string,
		onLog: HevyClientFactoryContext["onLog"],
	) => HevyClient;
	createServer?: (
		createClient: CreateHevyMcpServerOptions["createClient"],
		lifecycleSignal?: AbortSignal,
		executionDeadline?: number,
		observer?: CreateHevyMcpServerOptions["observer"],
		feedbackRecorder?: CreateHevyMcpServerOptions["feedbackRecorder"],
	) => Promise<McpServer>;
	createTransport?: () => WebStandardStreamableHTTPServerTransport;
	createObserver?: (
		options: WorkerToolObserverOptions,
	) => CreateHevyMcpServerOptions["observer"];
	createFeedbackRecorder?: (
		env: WorkerEnv,
	) => CreateHevyMcpServerOptions["feedbackRecorder"];
}

type ResolvedWorkerDependencies = Required<WorkerDependencies>;

interface WorkerRequestLogContext {
	requestId: string;
	method: string;
	path: string;
	origin: string | null;
	userAgent: string | null;
	authMode: "none" | "invalid" | "bearer" | "oauth";
	oauthEnabled: boolean;
}

function createRequestLogContext(
	request: Request,
	env: WorkerEnv,
): WorkerRequestLogContext {
	const authorization = request.headers.get("authorization");
	const bearer = parseBearerApiKey(authorization);
	return {
		requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
		method: request.method,
		path: new URL(request.url).pathname,
		origin: request.headers.get("origin"),
		userAgent: request.headers.get("user-agent"),
		authMode: !authorization
			? "none"
			: !bearer
				? "invalid"
				: hasOAuthAccessTokenFormat(bearer)
					? "oauth"
					: "bearer",
		oauthEnabled: isOAuthEnabled(env),
	};
}

function createDefaultValidationClient(
	apiKey: string,
	baseUrl: string,
): HevyClient {
	return createHevyClient({
		apiKey,
		baseUrl,
		maxGetRetries: 0,
		timeoutMs: WORKER_VALIDATION_TIMEOUT_MS,
	});
}

function createDefaultRequestClient(
	apiKey: string,
	baseUrl: string,
	onLog: HevyClientFactoryContext["onLog"],
): HevyClient {
	return createHevyClient({ apiKey, baseUrl, onLog });
}

async function createDefaultServer(
	createClient: CreateHevyMcpServerOptions["createClient"],
	lifecycleSignal?: AbortSignal,
	executionDeadline?: number,
	observer?: CreateHevyMcpServerOptions["observer"],
	feedbackRecorder?: CreateHevyMcpServerOptions["feedbackRecorder"],
): Promise<McpServer> {
	return await createHevyMcpServer({
		createClient,
		observer,
		lifecycleSignal,
		executionDeadline,
		feedbackRecorder,
	});
}

function createDefaultTransport(): WebStandardStreamableHTTPServerTransport {
	return new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
	});
}

function logWorkerWarning(
	context: string,
	error: Error | string,
	fields: Partial<WorkerRequestLogContext> = {},
): void {
	const diagnostic = createSafeErrorDiagnostic(error);
	console.warn({
		event: "worker.warning",
		message: formatSafeErrorLogMessage(context, error, diagnostic),
		context,
		...fields,
		...diagnostic,
	});
}

function logWorkerFailure(
	context: string,
	error: Error | string,
	fields: Partial<WorkerRequestLogContext> = {},
): void {
	const diagnostic = createSafeErrorDiagnostic(error);
	console.error({
		event: "worker.error",
		message: formatSafeErrorLogMessage(context, error, diagnostic),
		context,
		...fields,
		...diagnostic,
	});
}
function logOAuthResponse(
	context: WorkerRequestLogContext,
	statusCode: number,
): void {
	if (statusCode < 400) return;
	console.warn({
		event: "worker.oauth_response",
		...context,
		status: statusCode,
	});
}

function executionHttpResponse(
	error: Error | string,
	message: string,
	status: number,
	origin: string | null,
): Response {
	return withCors(executionResponse(error, message, status), origin);
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
		createObserver:
			dependencies.createObserver ??
			((options) => createWorkerToolObserver(options)),
		createFeedbackRecorder:
			dependencies.createFeedbackRecorder ??
			((env) =>
				createWorkerFeedbackRecorder(
					env.OTEL_COLLECTOR_TOKEN,
					fetch,
					env.HEVY_MCP_TELEMETRY !== "0",
				)),
	};
}

async function serveMcpRequest(
	request: Request,
	apiKey: string,
	hevyApiBaseUrl: string,
	dependencies: ResolvedWorkerDependencies,
	deadline: number,
	env: WorkerEnv,
	feedbackOnly: boolean,
): Promise<Response> {
	try {
		let observer: CreateHevyMcpServerOptions["observer"];
		if (!feedbackOnly) {
			const geography = getCloudflareGeography(request);
			observer = dependencies.createObserver({
				userHash: await createWorkerUserHash(apiKey),
				cloudflareColo: getCloudflareColo(request),
				geoLocalityName: geography.localityName,
				geoLocalityRegion: geography.localityRegion,
				geoCountryCode: geography.countryCode,
			});
		}
		const server = await dependencies.createServer(
			({ onLog }) =>
				dependencies.createRequestClient(apiKey, hevyApiBaseUrl, onLog),
			request.signal,
			deadline,
			observer,
			dependencies.createFeedbackRecorder(env),
		);
		const transport = dependencies.createTransport();
		transport.onerror = (error) => {
			if (isClientTransportError(error)) {
				logWorkerWarning("streamable-http-transport", error);
			} else {
				logWorkerFailure("streamable-http-transport", error);
			}
		};
		await server.connect(transport);
		return await transport.handleRequest(request);
	} catch (error) {
		const normalizedError = error instanceof Error ? error : String(error);
		logWorkerFailure("mcp-request-processing", normalizedError);
		return executionHttpResponse(
			normalizedError,
			"Unable to process MCP request",
			500,
			null,
		);
	}
}

export function createWorkerHandler(dependencies: WorkerDependencies = {}) {
	const resolved = resolveWorkerDependencies(dependencies);

	return async function handleRequest(
		request: Request,
		env: WorkerEnv,
		ctx?: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === HEALTH_PATH)
			return healthResponseWithCors(request, env);
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

		const deadline = Date.now() + WORKER_INVOCATION_TIMEOUT_MS;
		const feedbackOnly = await isFeedbackToolCall(request);
		const cachedFeedbackAuthorization =
			feedbackOnly && (await hasCachedValidation(apiKey, env));
		let validation: HevyApiKeyValidation;
		if (cachedFeedbackAuthorization) {
			// This key was confirmed valid by a prior request. Feedback does not
			// call Hevy, so it can still be reported when the upstream is down.
			validation = "valid";
		} else {
			try {
				validation = await validateHevyApiKeyResilient(
					apiKey,
					hevyApiBaseUrl,
					resolved.createValidationClient,
					validateHevyApiKey,
					env,
					{
						signal: request.signal,
						// One absolute deadline for the whole validation phase, shared
						// across the wrapper's retries. Passing the full invocation
						// deadline instead would let each retry's inner validateHevyApiKey
						// re-anchor its own now+WORKER_VALIDATION_TIMEOUT_MS window, so
						// three attempts could consume ~3x the budget this cap reserves
						// for MCP execution.
						deadline: Math.min(
							deadline,
							Date.now() + WORKER_VALIDATION_TIMEOUT_MS,
						),
					},
					// Pass the context through as-is: when it's absent (direct callers),
					// the wrapper awaits the cache write inline rather than handing it to
					// a no-op waitUntil that would drop it.
					ctx,
				);
			} catch (error) {
				const normalizedError = error instanceof Error ? error : String(error);
				logWorkerFailure("hevy-key-validation", normalizedError);
				return executionHttpResponse(
					normalizedError,
					"Unable to validate the Hevy API key",
					502,
					origin,
				);
			}
		}
		if (validation === "invalid") {
			return response("Unauthorized", 401, origin, {
				"WWW-Authenticate": "Bearer",
			});
		}

		return withCors(
			await serveMcpRequest(
				request,
				apiKey,
				hevyApiBaseUrl,
				resolved,
				deadline,
				env,
				feedbackOnly,
			),
			origin,
		);
	};
}

function createWorkerOAuthProvider(
	resolved: ResolvedWorkerDependencies,
	resource?: string,
): HevyOAuthWorker<WorkerEnv> {
	return createHevyOAuthProvider<WorkerEnv>(
		{
			validateApiKey: async (apiKey, env, signal, deadline) => {
				let hevyApiBaseUrl: string;
				try {
					hevyApiBaseUrl = resolveHevyApiBaseUrl(env.HEVY_API_BASE_URL);
				} catch {
					return "config-error";
				}
				// No ExecutionContext reaches this dependency today (the
				// HevyOAuthDependencies.validateApiKey interface doesn't thread one),
				// so the cache write stays awaited here rather than deferred via
				// waitUntil.
				return validateHevyApiKeyResilient(
					apiKey,
					hevyApiBaseUrl,
					resolved.createValidationClient,
					validateHevyApiKey,
					env,
					{
						signal,
						// Cap the whole validation phase (see the bearer path) so the
						// wrapper's retries share one deadline instead of re-anchoring.
						deadline: Math.min(
							deadline ?? Date.now() + WORKER_INVOCATION_TIMEOUT_MS,
							Date.now() + WORKER_VALIDATION_TIMEOUT_MS,
						),
					},
				);
			},
			serveMcp: async (request, env, apiKey, deadline) => {
				let hevyApiBaseUrl: string;
				try {
					hevyApiBaseUrl = resolveHevyApiBaseUrl(env.HEVY_API_BASE_URL);
				} catch {
					return new Response("Worker configuration error", { status: 500 });
				}
				return serveMcpRequest(
					request,
					apiKey,
					hevyApiBaseUrl,
					resolved,
					deadline ?? Date.now() + WORKER_INVOCATION_TIMEOUT_MS,
					env,
					await isFeedbackToolCall(request),
				);
			},
		},
		resource,
	);
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
	let oauthProvider: HevyOAuthWorker<WorkerEnv> | undefined;
	const getOAuthProvider = (env: WorkerEnv): HevyOAuthWorker<WorkerEnv> => {
		// Runtime bindings are available on fetch; the deployment value is stable
		// for the isolate, so keep one provider instance.
		oauthProvider ??= createWorkerOAuthProvider(
			resolved,
			env.OAUTH_RESOURCE?.trim() || undefined,
		);
		return oauthProvider;
	};

	return async function handleWorkerFetch(
		request: Request,
		env: WorkerEnv,
		ctx?: ExecutionContext,
	): Promise<Response> {
		const logContext = createRequestLogContext(request, env);
		const startedAt = Date.now();
		let responseStatus: number | null = null;
		try {
			if (new URL(request.url).pathname === HEALTH_PATH) {
				const health = healthResponseWithCors(request, env);
				responseStatus = health.status;
				return health;
			}
			if (!isOAuthEnabled(env)) {
				if (env.OAUTH_KV != null) {
					logWorkerFailure(
						"oauth-kv-misconfigured",
						new TypeError(
							"OAUTH_KV binding is not a KV namespace; OAuth stays disabled",
						),
						logContext,
					);
				}
				const legacyResponse = await legacyHandler(request, env, ctx);
				responseStatus = legacyResponse.status;
				return legacyResponse;
			}

			const originResult = validateOrigin(request, env);
			if (originResult instanceof Response) {
				responseStatus = originResult.status;
				return originResult;
			}
			const origin = originResult;
			const url = new URL(request.url);
			if (url.pathname === MCP_PATH) {
				if (request.method === "OPTIONS") {
					const legacyResponse = await legacyHandler(request, env, ctx);
					responseStatus = legacyResponse.status;
					return legacyResponse;
				}
				const bearer = parseBearerApiKey(request.headers.get("authorization"));
				if (bearer && !hasOAuthAccessTokenFormat(bearer)) {
					const legacyResponse = await legacyHandler(request, env, ctx);
					responseStatus = legacyResponse.status;
					return legacyResponse;
				}
				const providerResponse = await getOAuthProvider(env).fetch(
					request,
					env,
					requireExecutionContext(ctx),
				);
				responseStatus = providerResponse.status;
				logOAuthResponse(logContext, responseStatus);
				return withCors(providerResponse, origin);
			}
			const providerResponse = await getOAuthProvider(env).fetch(
				request,
				env,
				requireExecutionContext(ctx),
			);
			responseStatus = providerResponse.status;
			logOAuthResponse(logContext, responseStatus);
			return withCors(providerResponse, origin);
		} catch (error) {
			const normalizedError = error instanceof Error ? error : String(error);
			logWorkerFailure("request", normalizedError, logContext);
			throw error;
		} finally {
			console.log({
				event: "worker.request",
				...logContext,
				status: responseStatus,
				durationMs: Date.now() - startedAt,
			});
		}
	};
}

const handleWorkerFetch = createWorkerFetchHandler();

export default {
	fetch(
		request: Request,
		env: WorkerEnv,
		ctx?: ExecutionContext,
	): Promise<Response> {
		return handleWorkerFetch(request, env, ctx);
	},
};
