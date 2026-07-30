import { randomUUID, timingSafeEqual } from "node:crypto";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { createSafeErrorDiagnostic } from "@hevy-mcp/core";
import type { NodeCliOptions } from "./arguments.js";
import {
	runWithMcpSessionContext,
	createMcpSessionContext,
	recordMcpSessionStart,
	recordMcpSessionTermination,
	resolveSessionTerminationCategory,
	type McpSessionContext,
} from "./mcp-session-observability.js";

const MCP_PATH = "/mcp";
const MAX_BODY_BYTES = 1_048_576;
const HTTP_BEARER_TOKEN = "HEVY_MCP_HTTP_BEARER_TOKEN";

type HttpTransport = NodeStreamableHTTPServerTransport;
export interface OwnedMcpServer {
	connect(transport: HttpTransport): Promise<void>;
	close(): Promise<void>;
}

export type McpServerFactory = (params: {
	apiKey: string;
}) => Promise<OwnedMcpServer>;

interface HttpSession {
	transport: HttpTransport;
	server: OwnedMcpServer;
	context: McpSessionContext;
	responses: Set<ServerResponse>;
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
	return address && typeof address !== "string" ? address.port : 0;
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

function safeDiagnostic(error: unknown): string {
	return JSON.stringify(createSafeErrorDiagnostic(error));
}

function writeJson(res: ServerResponse, status: number, message: string): void {
	if (res.headersSent) return;
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json");
	res.end(JSON.stringify({ error: message }));
}

function readBody(request: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let size = 0;
		let rejected = false;
		const chunks: Buffer[] = [];
		const onData = (chunk: Buffer | string) => {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			size += buffer.byteLength;
			if (size > MAX_BODY_BYTES) {
				if (!rejected) {
					rejected = true;
					request.removeListener("data", onData);
					request.resume();
					reject(new HttpRequestError(413, "Request body is too large."));
				}
				return;
			}
			if (!rejected) chunks.push(buffer);
		};
		request.on("data", onData);
		request.once("error", (error) => {
			if (!rejected) reject(error);
		});
		request.once("end", () => {
			if (rejected) return;
			try {
				const raw = Buffer.concat(chunks).toString("utf8");
				resolve(raw.length === 0 ? undefined : JSON.parse(raw));
			} catch {
				reject(new HttpRequestError(400, "Request body must be valid JSON."));
			}
		});
	});
}

function isInitializeRequest(body: unknown): boolean {
	return Boolean(
		body &&
		typeof body === "object" &&
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
		server.close((error) => (error ? reject(error) : resolve()));
		server.closeIdleConnections();
		server.closeAllConnections();
	});
}

function isBearerAuthorized(
	request: IncomingMessage,
	token: string | undefined,
): boolean {
	if (!token) return false;
	const header = request.headers.authorization;
	if (typeof header !== "string") return false;
	const expected = Buffer.from(`Bearer ${token}`);
	const actual = Buffer.from(header);
	return (
		expected.byteLength === actual.byteLength &&
		timingSafeEqual(expected, actual)
	);
}

function aggregateErrors(errors: unknown[], message: string): unknown {
	if (errors.length === 1) return errors[0];
	return new AggregateError(errors, message);
}

export function isHttpHostAllowed(host: string): boolean {
	return isLoopbackHost(host);
}

export async function startStreamableHttpServer(
	options: NodeCliOptions,
	apiKey: string,
	createMcpServer: McpServerFactory,
): Promise<HttpServerHandle> {
	const wildcard =
		options.host === "0.0.0.0" ||
		options.host === "::" ||
		options.host === "[::]";
	const loopback = isLoopbackHost(options.host);
	const bearerToken = process.env[HTTP_BEARER_TOKEN];
	if (!loopback && !bearerToken) {
		throw new Error(
			`Non-loopback HTTP mode requires ${HTTP_BEARER_TOKEN} to protect the shared Hevy account.`,
		);
	}

	const sessions = new Map<string, HttpSession>();
	const cleanupErrors: unknown[] = [];
	const server = createServer((request, response) => {
		void handleRequest(request, response).catch((error: unknown) => {
			if (response.headersSent) {
				if (!response.writableEnded) response.destroy();
				return;
			}
			if (error instanceof HttpRequestError) {
				writeJson(response, error.statusCode, error.message);
				return;
			}
			console.error(`HTTP request failed: ${safeDiagnostic(error)}`);
			writeJson(response, 500, "Internal server error.");
		});
	});

	async function closeSession(
		session: HttpSession,
		failureCategory?: "connect_failure" | "startup_failure" | "unknown",
	): Promise<void> {
		if (session.closed) return;
		session.closed = true;
		for (const [id, current] of sessions) {
			if (current === session) sessions.delete(id);
		}
		for (const response of session.responses) {
			if (!response.writableEnded) response.destroy();
		}

		const results = await Promise.allSettled([
			Promise.resolve().then(() => session.transport.close()),
			Promise.resolve().then(() => session.server.close()),
		]);
		const errors = results.flatMap((result) =>
			result.status === "rejected" ? [result.reason] : [],
		);
		const succeeded = errors.length === 0;
		recordMcpSessionTermination(
			failureCategory && succeeded
				? failureCategory
				: resolveSessionTerminationCategory(succeeded, session.context),
			session.context,
		);
		if (errors.length > 0) {
			throw aggregateErrors(errors, "MCP session cleanup failed.");
		}
	}

	async function closeUnregistered(
		transport: HttpTransport,
		mcpServer: OwnedMcpServer | undefined,
	): Promise<void> {
		const results = await Promise.allSettled([
			Promise.resolve().then(() => transport.close()),
			...(mcpServer ? [Promise.resolve().then(() => mcpServer.close())] : []),
		]);
		const errors = results.flatMap((result) =>
			result.status === "rejected" ? [result.reason] : [],
		);
		if (errors.length > 0) throw aggregateErrors(errors, "MCP cleanup failed.");
		return;
	}

	async function handleRequest(
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<void> {
		if (request.url?.split("?", 1)[0] !== MCP_PATH) {
			writeJson(response, 404, "Not found");
			return;
		}
		if (
			!validateHostHeader(
				request,
				hostNamesFor(options),
				expectedPort(options, server),
				wildcard,
			)
		) {
			writeJson(response, 403, "Invalid Host header");
			return;
		}
		if (!loopback && !isBearerAuthorized(request, bearerToken)) {
			writeJson(response, 401, "Authorization required");
			return;
		}

		const body =
			request.method === "POST" ? await readBody(request) : undefined;
		const initializing = request.method === "POST" && isInitializeRequest(body);
		const sessionHeader = request.headers["mcp-session-id"];
		const sessionId =
			typeof sessionHeader === "string" ? sessionHeader : undefined;

		if (initializing) {
			if (sessionId) {
				writeJson(
					response,
					400,
					"Initialization must not include Mcp-Session-Id.",
				);
				return;
			}
			const context = createMcpSessionContext(body, "http");
			recordMcpSessionStart(body, "http", context);
			let session: HttpSession | undefined;
			let mcpServer: OwnedMcpServer | undefined;
			let connected = false;
			const transport = new NodeStreamableHTTPServerTransport({
				sessionIdGenerator: randomUUID,
				onsessioninitialized: (id) => {
					if (session) sessions.set(id, session);
				},
			});
			transport.onclose = () => {
				if (session) {
					void closeSession(session).catch((error: unknown) => {
						cleanupErrors.push(error);
					});
				}
			};
			try {
				mcpServer = await createMcpServer({ apiKey });
				session = {
					transport,
					server: mcpServer,
					context,
					responses: new Set(),
					closed: false,
				};
				await mcpServer.connect(transport);
				connected = true;
				session.responses.add(response);
				response.once("close", () => session?.responses.delete(response));
				await runWithMcpSessionContext(context, () =>
					transport.handleRequest(request, response, body),
				);
			} catch (error) {
				console.error(`HTTP session request failed: ${safeDiagnostic(error)}`);
				let cleanupError: unknown;
				try {
					if (session) {
						await closeSession(
							session,
							connected ? "unknown" : "connect_failure",
						);
					} else {
						await closeUnregistered(transport, mcpServer);
						recordMcpSessionTermination("startup_failure", context);
					}
				} catch (cleanupFailure) {
					cleanupError = cleanupFailure;
					if (!session) recordMcpSessionTermination("unknown", context);
				}
				if (cleanupError) {
					console.error(`HTTP cleanup failed: ${safeDiagnostic(cleanupError)}`);
				}
				if (!response.writableEnded)
					writeJson(response, 500, "Internal server error.");
			}
			return;
		}

		if (!sessionId) {
			writeJson(response, 400, "Mcp-Session-Id header is required.");
			return;
		}
		const session = sessions.get(sessionId);
		if (!session) {
			writeJson(response, 404, "Unknown Mcp-Session-Id.");
			return;
		}
		if (request.method !== "DELETE") {
			session.responses.add(response);
			response.once("close", () => session.responses.delete(response));
		}
		await runWithMcpSessionContext(session.context, () =>
			session.transport.handleRequest(request, response, body),
		);
	}

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(options.port, options.host, () => {
			server.removeListener("error", reject);
			resolve();
		});
	});

	let closePromise: Promise<void> | undefined;
	return {
		server,
		close: () => {
			if (closePromise) return closePromise;
			closePromise = (async () => {
				const sessionsToClose = [...sessions.values()];
				const results = await Promise.allSettled([
					...sessionsToClose.map((session) => closeSession(session)),
					closeServer(server),
				]);
				sessions.clear();
				const errors = [
					...cleanupErrors,
					...results.flatMap((result) =>
						result.status === "rejected" ? [result.reason] : [],
					),
				];
				if (errors.length > 0) {
					throw aggregateErrors(errors, "HTTP server cleanup failed.");
				}
			})();
			return closePromise;
		},
	};
}
