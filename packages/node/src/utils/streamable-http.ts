import { randomUUID, timingSafeEqual } from "node:crypto";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { z } from "zod";
import {
	createExecutionProjection,
	createSafeErrorDiagnostic,
} from "@hevy-mcp/core";
import { Effect, Exit, Fiber, Scope, Semaphore, Duration } from "effect";
import type { NodeCliOptions } from "./arguments.js";
import { httpAdmissionRejections, httpSessionEvictions } from "./metrics.js";
import {
	runWithMcpSessionContext,
	createMcpSessionContext,
	recordMcpSessionStart,
	recordMcpSessionTermination,
	resolveSessionTerminationCategory,
	type McpSessionContext,
} from "./mcp-session-observability.js";

const stringSchema = z.string();
const numberSchema = z.number();
const objectSchema = z.object({}).passthrough();

function isString<T>(value: T): value is T & string {
	return stringSchema.safeParse(value).success;
}

function isNumber<T>(value: T): value is T & number {
	return numberSchema.safeParse(value).success;
}

function isObject<T>(value: T): value is T & object {
	return objectSchema.safeParse(value).success;
}

const MCP_PATH = "/mcp";
const MAX_BODY_BYTES = 1_048_576;
const HTTP_BEARER_TOKEN = "HEVY_MCP_HTTP_BEARER_TOKEN";

const HTTP_ADMISSION_DEFAULTS = {
	maxSessions: 100,
	maxInitializing: 10,
	idleTimeoutMs: 30 * 60 * 1000,
	bodyTimeoutMs: 30 * 1000,
} as const;
const HTTP_ADMISSION_LIMITS = {
	maxSessions: 10_000,
	maxInitializing: 1_000,
	idleTimeoutMs: 24 * 60 * 60 * 1000,
	bodyTimeoutMs: 5 * 60 * 1000,
} as const;

export interface HttpAdmissionConfig {
	maxSessions: number;
	maxInitializing: number;
	idleTimeoutMs: number;
	bodyTimeoutMs: number;
}

function parsePositiveLimit<T>(
	value: T,
	fallback: number,
	maximum: number,
): number {
	const parsed = isNumber(value) ? value : Number(value);
	if (!Number.isFinite(parsed) || parsed < 1) return fallback;
	return Math.min(Math.floor(parsed), maximum);
}

function envLimit(name: string, fallback: number, maximum: number): number {
	return parsePositiveLimit(process.env[name], fallback, maximum);
}

export function resolveHttpAdmissionConfig(
	overrides: Partial<HttpAdmissionConfig> = {},
): HttpAdmissionConfig {
	return {
		maxSessions: parsePositiveLimit(
			overrides.maxSessions ??
				envLimit(
					"HEVY_MCP_HTTP_MAX_SESSIONS",
					HTTP_ADMISSION_DEFAULTS.maxSessions,
					HTTP_ADMISSION_LIMITS.maxSessions,
				),
			HTTP_ADMISSION_DEFAULTS.maxSessions,
			HTTP_ADMISSION_LIMITS.maxSessions,
		),
		maxInitializing: parsePositiveLimit(
			overrides.maxInitializing ??
				envLimit(
					"HEVY_MCP_HTTP_MAX_INITIALIZING",
					HTTP_ADMISSION_DEFAULTS.maxInitializing,
					HTTP_ADMISSION_LIMITS.maxInitializing,
				),
			HTTP_ADMISSION_DEFAULTS.maxInitializing,
			HTTP_ADMISSION_LIMITS.maxInitializing,
		),
		idleTimeoutMs: parsePositiveLimit(
			overrides.idleTimeoutMs ??
				envLimit(
					"HEVY_MCP_HTTP_IDLE_TIMEOUT_MS",
					HTTP_ADMISSION_DEFAULTS.idleTimeoutMs,
					HTTP_ADMISSION_LIMITS.idleTimeoutMs,
				),
			HTTP_ADMISSION_DEFAULTS.idleTimeoutMs,
			HTTP_ADMISSION_LIMITS.idleTimeoutMs,
		),
		bodyTimeoutMs: parsePositiveLimit(
			overrides.bodyTimeoutMs ??
				envLimit(
					"HEVY_MCP_HTTP_BODY_TIMEOUT_MS",
					HTTP_ADMISSION_DEFAULTS.bodyTimeoutMs,
					HTTP_ADMISSION_LIMITS.bodyTimeoutMs,
				),
			HTTP_ADMISSION_DEFAULTS.bodyTimeoutMs,
			HTTP_ADMISSION_LIMITS.bodyTimeoutMs,
		),
	};
}

type HttpTransport = NodeStreamableHTTPServerTransport;
export interface OwnedMcpServer {
	connect(transport: HttpTransport): Promise<void>;
	close(): Promise<void>;
}

export type McpServerFactory = (params: {
	apiKey: string;
	lifecycleSignal?: AbortSignal;
}) => Promise<OwnedMcpServer>;

interface HttpSession {
	transport: HttpTransport;
	server?: OwnedMcpServer;
	context: McpSessionContext;
	lifecycleController: AbortController;
	responses: Set<ServerResponse>;
	scope: Scope.Closeable;
	id?: string;
	idleFiber?: Fiber.Fiber<void, never>;
	idleGeneration: number;
	closePromise?: Promise<void>;
	finalizationErrors: unknown[];
	terminationCategory?: "connect_failure" | "startup_failure" | "unknown";
	terminationRecorded: boolean;
	closed: boolean;
}

export interface HttpServerHandle {
	close(): Promise<void>;
	server: Server;
}

class HttpRequestError extends Error {
	readonly statusCode: number;

	constructor(statusCode: number, message: string) {
		super(message);
		this.name = "HttpRequestError";
		this.statusCode = statusCode;
	}
}

function normalizeHost(host: string): string {
	return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

function isLoopbackHost(host: string): boolean {
	const normalized = normalizeHost(host).toLowerCase();
	return (
		normalized === "localhost" ||
		normalized === "127.0.0.1" ||
		normalized === "::1"
	);
}

function hostNamesFor(options: NodeCliOptions): Set<string> {
	const configured = normalizeHost(options.host).toLowerCase();
	const names = new Set([configured]);
	if (isLoopbackHost(options.host)) {
		names.add("localhost");
		names.add("127.0.0.1");
		names.add("::1");
	}
	return names;
}

function expectedPort(options: NodeCliOptions, server: Server): number {
	if (options.port !== 0) return options.port;
	const address = server.address();
	return address && !isString(address) ? address.port : 0;
}

function validateHostHeader(
	request: IncomingMessage,
	allowedHosts: Set<string>,
	port: number,
	allowAnyHostname = false,
): boolean {
	const header = request.headers.host;
	if (!header || Array.isArray(header)) return false;
	try {
		const parsed = new URL(`http://${header}`);
		if (
			parsed.username ||
			parsed.password ||
			parsed.pathname !== "/" ||
			parsed.search ||
			parsed.hash ||
			(!allowAnyHostname && (parsed.port ? Number(parsed.port) : 80) !== port)
		) {
			return false;
		}
		return (
			allowAnyHostname ||
			allowedHosts.has(normalizeHost(parsed.hostname).toLowerCase())
		);
	} catch {
		return false;
	}
}

function safeDiagnostic<T>(error: T): string {
	return JSON.stringify(createSafeErrorDiagnostic(error));
}

function writeJson(res: ServerResponse, status: number, message: string): void {
	if (res.headersSent || res.destroyed) return;
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json");
	res.end(JSON.stringify({ error: message }));
}

function writeExecutionJson<T>(
	res: ServerResponse,
	status: number,
	message: string,
	error: T,
): void {
	if (res.headersSent || res.destroyed) return;
	const diagnostic = createSafeErrorDiagnostic(error);
	const execution = createExecutionProjection(diagnostic);
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json");
	res.end(
		JSON.stringify({
			error: { message, ...execution },
		}),
	);
}

interface ReadBodyHandlers {
	onData: (chunk: Buffer | string) => void;
	onError: (error: Error) => void;
	onAbort: () => void;
	onEnd: () => void;
	onTimeout: () => void;
}

interface RejectBeforeBodyHandlers {
	onError: () => void;
}

function readBody(
	request: IncomingMessage,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<unknown> {
	const read = Effect.callback<unknown, HttpRequestError>(
		(resume, interruptionSignal) => {
			let size = 0;
			const chunks: Buffer[] = [];
			let settled = false;
			const handlers: ReadBodyHandlers = {
				onData: () => {},
				onError: () => {},
				onAbort: () => {},
				onEnd: () => {},
				onTimeout: () => {},
			};
			const cleanup = () => {
				request.removeListener("data", handlers.onData);
				request.removeListener("end", handlers.onEnd);
				request.removeListener("error", handlers.onError);
				signal?.removeEventListener("abort", handlers.onAbort);
				interruptionSignal.removeEventListener("abort", handlers.onAbort);
			};
			const settle = (
				effect:
					| ReturnType<typeof Effect.succeed<unknown>>
					| ReturnType<typeof Effect.fail<HttpRequestError>>,
			) => {
				if (settled) return;
				settled = true;
				cleanup();
				resume(effect);
			};
			const rejectAndDrain = (error: HttpRequestError) => {
				if (settled) return;
				settled = true;
				cleanup();
				request.resume();
				resume(Effect.fail(error));
			};
			handlers.onData = (chunk: Buffer | string) => {
				const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				size += buffer.byteLength;
				if (size > MAX_BODY_BYTES) {
					rejectAndDrain(
						new HttpRequestError(413, "Request body is too large."),
					);
					return;
				}
				if (!settled) chunks.push(buffer);
			};
			handlers.onError = (_error: Error) =>
				settle(
					Effect.fail(
						new HttpRequestError(500, "Request body could not be read."),
					),
				);
			handlers.onAbort = () =>
				rejectAndDrain(
					new HttpRequestError(
						503,
						"HTTP server is shutting down. Retry shortly.",
					),
				);
			handlers.onEnd = () => {
				try {
					const raw = Buffer.concat(chunks).toString("utf8");
					settle(
						Effect.succeed(raw.length === 0 ? undefined : JSON.parse(raw)),
					);
				} catch {
					settle(
						Effect.fail(
							new HttpRequestError(400, "Request body must be valid JSON."),
						),
					);
				}
			};
			handlers.onTimeout = () =>
				rejectAndDrain(new HttpRequestError(408, "Request body timed out."));
			request.on("data", handlers.onData);
			request.once("error", handlers.onError);
			request.once("end", handlers.onEnd);
			signal?.addEventListener("abort", handlers.onAbort, { once: true });
			interruptionSignal.addEventListener("abort", handlers.onAbort, {
				once: true,
			});
			if (signal?.aborted || interruptionSignal.aborted) {
				handlers.onAbort();
			}
			return Effect.sync(() => {
				if (settled) return;
				settled = true;
				cleanup();
				request.resume();
			});
		},
	).pipe(
		Effect.timeoutOrElse({
			duration: timeoutMs,
			orElse: () =>
				Effect.fail(new HttpRequestError(408, "Request body timed out.")),
		}),
	);
	return Effect.runPromise(read);
}

function isInitializeRequest<T>(body: T): boolean {
	return Boolean(
		body &&
		isObject(body) &&
		!Array.isArray(body) &&
		"method" in body &&
		body.method === "initialize",
	);
}

function closeServer(server: Server): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!server.listening) {
			resolve();
			return;
		}
		setImmediate(() => {
			server.close((error) => (error ? reject(error) : resolve()));
			// Let the current request turn write a bounded shutdown response
			// before closing connections. Closing idle or active connections in
			// the same turn as `shuttingDown = true` can reset a request admitted
			// just before close() before its 503 reaches the client.
			setImmediate(() => {
				server.closeIdleConnections();
				server.closeAllConnections();
			});
		});
	});
}

function isBearerAuthorized(
	request: IncomingMessage,
	token: string | undefined,
): boolean {
	if (!token) return false;
	const header = request.headers.authorization;
	if (!isString(header)) return false;
	const expected = Buffer.from(`Bearer ${token}`);
	const actual = Buffer.from(header);
	return (
		expected.byteLength === actual.byteLength &&
		timingSafeEqual(expected, actual)
	);
}

function aggregateErrors<T>(errors: T[], message: string): T | AggregateError {
	if (errors.length === 1) return errors[0];
	return new AggregateError(errors, message);
}

function recordHttpAdmissionRejection(
	reason: "shutting_down" | "initializing_capacity" | "session_capacity",
): void {
	try {
		httpAdmissionRejections.add(1, { reason });
	} catch {
		// Optional telemetry must never affect admission behavior.
	}
}

function recordHttpSessionEviction(): void {
	try {
		httpSessionEvictions.add(1, { reason: "idle" });
	} catch {
		// Optional telemetry must never affect cleanup behavior.
	}
}

function rejectBeforeBody(
	request: IncomingMessage,
	response: ServerResponse,
	status: number,
	message: string,
	timeoutMs: number,
): void {
	const handlers: RejectBeforeBodyHandlers = { onError: () => {} };
	const timer = setTimeout(() => request.destroy(), timeoutMs);
	const cleanup = () => {
		clearTimeout(timer);
		request.removeListener("error", handlers.onError);
		request.removeListener("close", cleanup);
	};
	handlers.onError = () => cleanup();
	request.once("error", handlers.onError);
	request.once("close", cleanup);
	timer.unref?.();
	request.resume();
	writeJson(response, status, message);
}

export function isHttpHostAllowed(host: string): boolean {
	return isLoopbackHost(host);
}

export async function startStreamableHttpServer(
	options: NodeCliOptions,
	apiKey: string,
	createMcpServer: McpServerFactory,
	configOverrides: Partial<HttpAdmissionConfig> = {},
): Promise<HttpServerHandle> {
	const config = resolveHttpAdmissionConfig(configOverrides);
	const wildcard =
		options.host === "0.0.0.0" ||
		options.host === "::" ||
		options.host === "[::]";
	const loopback = isLoopbackHost(options.host);
	const bearerToken = process.env[HTTP_BEARER_TOKEN];
	if (!loopback && !bearerToken) {
		throw new Error(
			`Non-loopback HTTP mode requires ${HTTP_BEARER_TOKEN} to protect the shared Hevy account. Set ${HTTP_BEARER_TOKEN} to a secure random value, then retry.`,
		);
	}

	const sessions = new Map<string, HttpSession>();
	const pendingSessions = new Set<HttpSession>();
	const initializationControllers = new Set<AbortController>();
	const initializationPromises = new Set<Promise<void>>();
	const initializingSemaphore = Semaphore.makeUnsafe(config.maxInitializing);
	const cleanupErrors: unknown[] = [];
	const httpScope = await Effect.runPromise(Scope.make("parallel"));
	await Effect.runPromise(
		Scope.addFinalizer(
			httpScope,
			Effect.sync(() => {
				for (const controller of initializationControllers) {
					controller.abort(
						new DOMException("HTTP server scope closed", "AbortError"),
					);
				}
			}),
		),
	);
	let shuttingDown = false;
	// Keep the assigned ephemeral port after server.close() starts so a request
	// already admitted during shutdown still passes Host validation.
	let listeningPort = options.port;
	const server = createServer((request, response) => {
		void handleRequest(request, response).catch((error) => {
			if (response.headersSent || response.destroyed) {
				if (!response.writableEnded) response.destroy();
				return;
			}
			if (error instanceof HttpRequestError) {
				writeJson(response, error.statusCode, error.message);
				return;
			}
			console.error(`HTTP request failed: ${safeDiagnostic(error)}`);
			writeExecutionJson(response, 500, "Internal server error.", error);
		});
	});

	function armIdleEviction(session: HttpSession): void {
		if (session.closed) return;
		session.idleGeneration += 1;
		const generation = session.idleGeneration;
		if (session.idleFiber) {
			Effect.runFork(Fiber.interrupt(session.idleFiber));
		}
		const idle = Effect.sleep(Duration.millis(config.idleTimeoutMs)).pipe(
			Effect.andThen(
				Effect.sync(() => {
					if (session.closed || session.idleGeneration !== generation) {
						return;
					}
					const hasActiveResponse = [...session.responses].some(
						(response) => !response.writableEnded,
					);
					if (hasActiveResponse) {
						queueMicrotask(() => armIdleEviction(session));
						return;
					}
					recordHttpSessionEviction();
					queueMicrotask(() => {
						void closeSession(session).catch((error) => {
							cleanupErrors.push(error);
						});
					});
				}),
			),
		);
		session.idleFiber = Effect.runSync(
			Effect.forkIn(idle, session.scope, { startImmediately: true }),
		);
	}

	async function closeSession(
		session: HttpSession,
		failureCategory?: "connect_failure" | "startup_failure" | "unknown",
	): Promise<void> {
		if (failureCategory && !session.terminationCategory) {
			session.terminationCategory = failureCategory;
		}
		if (session.closePromise) return session.closePromise;
		session.closed = true;
		session.closePromise = (async () => {
			// The registry only indexes sessions. Ownership and cleanup live in
			// the child Scope finalizer below.
			await Effect.runPromise(Scope.close(session.scope, Exit.void));
			if (session.finalizationErrors.length > 0) {
				throw aggregateErrors(
					session.finalizationErrors,
					"MCP session cleanup failed.",
				);
			}
		})();
		return session.closePromise;
	}

	function trackSessionResponse(
		session: HttpSession,
		response: ServerResponse,
	): void {
		session.responses.add(response);
		response.once("close", () => {
			session.responses.delete(response);
			// A destroyed response means the client disconnected before the
			// exchange completed. The SDK does not expose a request-scoped signal
			// for this transport, so evict and close the whole session rather than
			// leaving an aborted session reusable or poisoning future requests.
			if (!response.writableEnded && !session.closed) {
				void closeSession(session).catch((error) => {
					cleanupErrors.push(error);
				});
			} else if (!session.closed) {
				armIdleEviction(session);
			}
		});
	}

	interface RequestSessionResolution {
		sessionId?: string;
		existingSession?: HttpSession;
		trackedExistingResponse: boolean;
	}

	function resolveRequestSession(
		request: IncomingMessage,
		response: ServerResponse,
	): RequestSessionResolution | undefined {
		if (request.url?.split("?", 1)[0] !== MCP_PATH) {
			writeJson(response, 404, "Not found");
			return undefined;
		}
		if (
			!validateHostHeader(
				request,
				hostNamesFor(options),
				listeningPort,
				wildcard,
			)
		) {
			writeJson(response, 403, "Invalid Host header");
			return undefined;
		}
		if (!loopback && !isBearerAuthorized(request, bearerToken)) {
			writeJson(response, 401, "Authorization required");
			return undefined;
		}

		const sessionHeader = request.headers["mcp-session-id"];
		const sessionId = isString(sessionHeader) ? sessionHeader : undefined;
		const existingSession = sessionId ? sessions.get(sessionId) : undefined;
		if (sessionId && !existingSession) {
			rejectBeforeBody(
				request,
				response,
				404,
				"Unknown Mcp-Session-Id.",
				config.bodyTimeoutMs,
			);
			return undefined;
		}
		if (existingSession && request.method !== "DELETE") {
			trackSessionResponse(existingSession, response);
			return { sessionId, existingSession, trackedExistingResponse: true };
		}
		return { sessionId, existingSession, trackedExistingResponse: false };
	}

	interface InitializationReservation {
		controller: AbortController;
		release: () => void;
	}

	function reserveInitialization(
		request: IncomingMessage,
		response: ServerResponse,
	): InitializationReservation | null {
		if (shuttingDown) {
			recordHttpAdmissionRejection("shutting_down");
			rejectBeforeBody(
				request,
				response,
				503,
				"HTTP server is shutting down. Retry shortly.",
				config.bodyTimeoutMs,
			);
			return null;
		}
		if (sessions.size + initializationControllers.size >= config.maxSessions) {
			recordHttpAdmissionRejection("session_capacity");
			rejectBeforeBody(
				request,
				response,
				429,
				"MCP session capacity reached. Retry after an existing session closes.",
				config.bodyTimeoutMs,
			);
			return null;
		}

		const permitAcquired = Effect.runSync(
			initializingSemaphore.takeIfAvailable(1),
		);
		if (!permitAcquired) {
			recordHttpAdmissionRejection("initializing_capacity");
			rejectBeforeBody(
				request,
				response,
				503,
				"MCP server is busy initializing sessions. Retry shortly.",
				config.bodyTimeoutMs,
			);
			return null;
		}
		const controller = new AbortController();
		initializationControllers.add(controller);
		let resolveInitialization!: () => void;
		const initializationComplete = new Promise<void>((resolve) => {
			resolveInitialization = resolve;
		});
		initializationPromises.add(initializationComplete);
		let released = false;
		const onResponseClose = () => {
			if (!response.writableEnded) {
				controller.abort(
					new DOMException("MCP initialization response closed", "AbortError"),
				);
			}
		};
		response.once("close", onResponseClose);
		return {
			controller,
			release: () => {
				if (released) return;
				released = true;
				response.removeListener("close", onResponseClose);
				initializationControllers.delete(controller);
				initializationPromises.delete(initializationComplete);
				Effect.runSync(initializingSemaphore.release(1));
				resolveInitialization();
			},
		};
	}

	async function handleInitializedSession<T>(
		request: IncomingMessage,
		response: ServerResponse,
		body: T,
		reservation: InitializationReservation,
	): Promise<void> {
		const context = createMcpSessionContext(isObject(body) ? body : {}, "http");
		recordMcpSessionStart(isObject(body) ? body : {}, "http", context);
		let session: HttpSession | undefined;
		let mcpServer: OwnedMcpServer | undefined;
		let connected = false;
		const lifecycleController = reservation.controller;
		const transport = new NodeStreamableHTTPServerTransport({
			sessionIdGenerator: randomUUID,
			onsessioninitialized: (id) => {
				if (!session) return;
				if (shuttingDown || lifecycleController.signal.aborted) {
					void closeSession(session, "startup_failure").catch((error) => {
						cleanupErrors.push(error);
					});
					return;
				}
				session.id = id;
				sessions.set(id, session);
				pendingSessions.delete(session);
				initializationControllers.delete(lifecycleController);
				armIdleEviction(session);
			},
		});
		transport.onclose = () => {
			if (session) {
				void closeSession(session).catch((error) => {
					cleanupErrors.push(error);
				});
			}
		};
		try {
			const scope = await Effect.runPromise(Scope.fork(httpScope));
			session = {
				transport,
				context,
				lifecycleController,
				scope,
				responses: new Set(),
				idleGeneration: 0,
				finalizationErrors: [],
				terminationRecorded: false,
				closed: false,
			};
			// Initialization is owned by the server scope from the moment its
			// child scope exists, not only after the SDK assigns a session id.
			pendingSessions.add(session);
			await Effect.runPromise(
				Scope.addFinalizer(
					scope,
					Effect.promise(async () => {
						const currentSession = session;
						if (!currentSession) return;
						pendingSessions.delete(currentSession);
						if (currentSession.id) sessions.delete(currentSession.id);
						currentSession.lifecycleController.abort(
							new DOMException("MCP session closed", "AbortError"),
						);
						for (const response of currentSession.responses) {
							if (!response.writableEnded) response.destroy();
						}
						const results = await Promise.allSettled([
							Promise.resolve().then(() => currentSession.transport.close()),
							...(currentSession.server
								? [Promise.resolve().then(() => currentSession.server?.close())]
								: []),
						]);
						currentSession.finalizationErrors.push(
							...results.flatMap((result) =>
								result.status === "rejected" ? [result.reason] : [],
							),
						);
						if (!currentSession.terminationRecorded) {
							currentSession.terminationRecorded = true;
							const succeeded = currentSession.finalizationErrors.length === 0;
							recordMcpSessionTermination(
								currentSession.terminationCategory && succeeded
									? currentSession.terminationCategory
									: resolveSessionTerminationCategory(
											succeeded,
											currentSession.context,
										),
								currentSession.context,
							);
						}
					}),
				),
			);
			mcpServer = await createMcpServer({
				apiKey,
				lifecycleSignal: lifecycleController.signal,
			});
			const currentSession = session;
			if (!currentSession) {
				await mcpServer.close();
				return;
			}
			if (currentSession.closed) {
				await mcpServer.close().catch((error) => {
					currentSession.finalizationErrors.push(error);
				});
				return;
			}
			if (shuttingDown || lifecycleController.signal.aborted) {
				currentSession.server = mcpServer;
				await closeSession(currentSession, "startup_failure");
				return;
			}
			currentSession.server = mcpServer;
			await mcpServer.connect(transport);
			connected = true;
			if (shuttingDown || lifecycleController.signal.aborted) {
				await closeSession(currentSession, "startup_failure");
				return;
			}
			trackSessionResponse(currentSession, response);
			await runWithMcpSessionContext(context, () =>
				transport.handleRequest(request, response, body),
			);
		} catch (error) {
			lifecycleController.abort(
				new DOMException("MCP session startup failed", "AbortError"),
			);
			console.error(`HTTP session request failed: ${safeDiagnostic(error)}`);
			let cleanupError: unknown;
			try {
				if (session) {
					await closeSession(
						session,
						connected ? "unknown" : "connect_failure",
					);
				} else {
					const ownedServer = mcpServer;
					const results = await Promise.allSettled([
						Promise.resolve().then(() => transport.close()),
						...(ownedServer
							? [Promise.resolve().then(() => ownedServer.close())]
							: []),
					]);
					const errors = results.flatMap((result) =>
						result.status === "rejected" ? [result.reason] : [],
					);
					if (errors.length > 0) {
						throw aggregateErrors(errors, "MCP cleanup failed.");
					}
					recordMcpSessionTermination("startup_failure", context);
				}
			} catch (cleanupFailure) {
				cleanupError = cleanupFailure;
				if (!session) {
					recordMcpSessionTermination("startup_failure", context);
				}
			}
			if (cleanupError) {
				console.error(`HTTP cleanup failed: ${safeDiagnostic(cleanupError)}`);
			}
			if (!response.writableEnded && !shuttingDown)
				writeExecutionJson(response, 500, "Internal server error.", error);
		}
	}

	async function handleInitializationRequest<T>(
		request: IncomingMessage,
		response: ServerResponse,
		body: T,
		sessionId: string | undefined,
		reservation: InitializationReservation | undefined,
	): Promise<boolean> {
		if (request.method !== "POST" || !isInitializeRequest(body)) return false;
		if (sessionId) {
			writeJson(
				response,
				400,
				"Initialization must not include Mcp-Session-Id.",
			);
			return true;
		}
		if (!reservation) {
			writeJson(
				response,
				503,
				"MCP initialization capacity is unavailable. Retry shortly.",
			);
			return true;
		}
		await handleInitializedSession(request, response, body, reservation);
		return true;
	}

	async function handleExistingSessionRequest<T>(
		request: IncomingMessage,
		response: ServerResponse,
		body: T,
		sessionId: string | undefined,
		existingSession: HttpSession | undefined,
		trackedExistingResponse: boolean,
	): Promise<void> {
		if (!sessionId) {
			writeJson(response, 400, "Mcp-Session-Id header is required.");
			return;
		}
		const session = existingSession ?? sessions.get(sessionId);
		if (!session) {
			writeJson(response, 404, "Unknown Mcp-Session-Id.");
			return;
		}
		armIdleEviction(session);
		if (request.method !== "DELETE" && !trackedExistingResponse) {
			trackSessionResponse(session, response);
		}
		await runWithMcpSessionContext(session.context, () =>
			session.transport.handleRequest(request, response, body),
		);
		if (request.method === "DELETE" && !session.closed) {
			try {
				await closeSession(session);
			} catch (error) {
				cleanupErrors.push(error);
			}
		}
	}

	async function handleRequest(
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<void> {
		let releaseInitialization: (() => void) | undefined;
		try {
			const resolution = resolveRequestSession(request, response);
			if (!resolution) return;
			const requiresInitialization =
				request.method === "POST" && !resolution.sessionId;
			const reservation = requiresInitialization
				? reserveInitialization(request, response)
				: undefined;
			if (requiresInitialization && !reservation) return;
			releaseInitialization = reservation?.release;
			const body =
				request.method === "POST"
					? await readBody(
							request,
							config.bodyTimeoutMs,
							reservation?.controller.signal ??
								resolution.existingSession?.lifecycleController.signal,
						)
					: undefined;
			if (shuttingDown) {
				writeJson(
					response,
					503,
					"HTTP server is shutting down. Retry shortly.",
				);
				return;
			}
			if (
				await handleInitializationRequest(
					request,
					response,
					body,
					resolution.sessionId,
					reservation ?? undefined,
				)
			)
				return;
			await handleExistingSessionRequest(
				request,
				response,
				body,
				resolution.sessionId,
				resolution.existingSession,
				resolution.trackedExistingResponse,
			);
		} finally {
			releaseInitialization?.();
		}
	}

	try {
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(options.port, options.host, () => {
				server.removeListener("error", reject);
				resolve();
			});
		});
	} catch (error) {
		await closeServer(server).catch(() => undefined);
		await Effect.runPromise(Scope.close(httpScope, Exit.void)).catch(
			() => undefined,
		);
		throw error;
	}
	listeningPort = expectedPort(options, server);

	let closePromise: Promise<void> | undefined;
	return {
		server,
		close: () => {
			if (closePromise) return closePromise;
			closePromise = (async () => {
				shuttingDown = true;
				for (const controller of initializationControllers) {
					controller.abort(
						new DOMException("HTTP server is shutting down", "AbortError"),
					);
				}
				const sessionsToClose = [
					...new Set([...sessions.values(), ...pendingSessions]),
				];
				const results = await Promise.allSettled([
					...sessionsToClose.map((session) => closeSession(session)),
					closeServer(server),
				]);
				const initializationResults = await Promise.allSettled([
					...initializationPromises,
				]);
				sessions.clear();
				pendingSessions.clear();
				const errors = [
					...cleanupErrors,
					...results.flatMap((result) =>
						result.status === "rejected" ? [result.reason] : [],
					),
					...initializationResults.flatMap((result) =>
						result.status === "rejected" ? [result.reason] : [],
					),
				];
				await Effect.runPromise(Scope.close(httpScope, Exit.void)).catch(
					(error) => errors.push(error),
				);
				if (errors.length > 0) {
					throw aggregateErrors(errors, "HTTP server cleanup failed.");
				}
			})();
			return closePromise;
		},
	};
}
