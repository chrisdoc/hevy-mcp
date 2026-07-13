import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { networkInterfaces } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const LOOPBACK = "127.0.0.1";
const ALLOWED_ORIGIN = "https://allowed.example";
const VALID_API_KEY = "valid-test-key";
const INVALID_API_KEY = "invalid-test-key";
const UPSTREAM_FAILURE_API_KEY = "upstream-failure-key";
const REDIRECT_API_KEY = "redirect-test-key";
const STARTUP_TIMEOUT_MS = 20_000;
const MAX_STARTUP_ATTEMPTS = 3;
const SHUTDOWN_TIMEOUT_MS = 3_000;
const MAX_CAPTURED_LOG_LENGTH = 64 * 1024;

interface RecordedHevyRequest {
	apiKey: string | undefined;
	authorization: string | undefined;
	method: string;
	url: string;
}

let fakeHevyServer: Server;
let fakeHevyBaseUrl: string;
let redirectRecorderServer: Server;
let redirectDestinationUrl: string;
let wrangler: ChildProcessWithoutNullStreams;
let workerBaseUrl: string;
let wranglerLogs = "";
let wranglerSpawnError: Error | undefined;
const hevyRequests: RecordedHevyRequest[] = [];
const redirectRequests: RecordedHevyRequest[] = [];

function appendWranglerLog(chunk: Buffer): void {
	wranglerLogs = `${wranglerLogs}${chunk.toString()}`.slice(
		-MAX_CAPTURED_LOG_LENGTH,
	);
}

function listen(server: Server, host = LOOPBACK): Promise<number> {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, host, () => {
			server.off("error", reject);
			resolve((server.address() as AddressInfo).port);
		});
	});
}

function localNetworkAddress(): string {
	for (const addresses of Object.values(networkInterfaces())) {
		const address = addresses?.find(
			(candidate) => candidate.family === "IPv4" && !candidate.internal,
		);
		if (address) return address.address;
	}
	throw new Error("No non-loopback IPv4 address is available for workerd");
}

function close(server: Server): Promise<void> {
	if (!server.listening) return Promise.resolve();
	server.closeAllConnections();
	return new Promise((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
}

async function allocateWranglerPorts(): Promise<{
	inspectorPort: number;
	workerPort: number;
}> {
	const workerReservation = createServer();
	const inspectorReservation = createServer();
	try {
		const [workerPort, inspectorPort] = await Promise.all([
			listen(workerReservation),
			listen(inspectorReservation),
		]);
		return { inspectorPort, workerPort };
	} finally {
		await Promise.all([close(workerReservation), close(inspectorReservation)]);
	}
}

function spawnWrangler(workerPort: number, inspectorPort: number): void {
	workerBaseUrl = `http://${LOOPBACK}:${workerPort}`;
	wranglerSpawnError = undefined;
	const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
	wrangler = spawn(
		npmCommand,
		[
			"exec",
			"--",
			"wrangler",
			"dev",
			"--local",
			"--ip",
			LOOPBACK,
			"--port",
			String(workerPort),
			"--inspector-ip",
			LOOPBACK,
			"--inspector-port",
			String(inspectorPort),
			"--local-protocol",
			"http",
			"--show-interactive-dev-session=false",
			"--log-level",
			"warn",
			"--var",
			`HEVY_API_BASE_URL:${fakeHevyBaseUrl}`,
			"--var",
			`MCP_ALLOWED_ORIGINS:${ALLOWED_ORIGIN}`,
		],
		{
			cwd: process.cwd(),
			detached: process.platform !== "win32",
			env: { ...process.env, CI: "true", NO_COLOR: "1" },
			stdio: "pipe",
		},
	);
	wrangler.stdout.on("data", appendWranglerLog);
	wrangler.stderr.on("data", appendWranglerLog);
	wrangler.once("error", (error) => {
		wranglerSpawnError = error;
	});
}

function writeJson(
	response: import("node:http").ServerResponse,
	status: number,
	body: unknown,
): void {
	response.writeHead(status, { "content-type": "application/json" });
	response.end(JSON.stringify(body));
}

async function waitForWranglerReady(): Promise<void> {
	const deadline = Date.now() + STARTUP_TIMEOUT_MS;
	let lastError: unknown;
	while (Date.now() < deadline) {
		if (wranglerSpawnError) throw wranglerSpawnError;
		if (wrangler.exitCode !== null) {
			throw new Error(
				`Wrangler exited with code ${wrangler.exitCode}.\n${wranglerLogs}`,
			);
		}
		try {
			const response = await fetch(`${workerBaseUrl}/ready`, {
				signal: AbortSignal.timeout(500),
			});
			await response.body?.cancel();
			if (response.status === 404) return;
			lastError = new Error(`Unexpected readiness status ${response.status}`);
		} catch (error) {
			lastError = error;
		}
		await delay(100);
	}
	throw new Error(
		`Wrangler was not ready within ${STARTUP_TIMEOUT_MS}ms: ${String(lastError)}\n${wranglerLogs}`,
	);
}

async function stopWrangler(): Promise<void> {
	if (!wrangler || wrangler.exitCode !== null || wrangler.pid === undefined)
		return;

	const exited = new Promise<void>((resolve) =>
		wrangler.once("exit", () => resolve()),
	);
	const signalProcessGroup = (signal: NodeJS.Signals) => {
		try {
			if (process.platform === "win32") wrangler.kill(signal);
			else process.kill(-wrangler.pid!, signal);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
		}
	};

	signalProcessGroup("SIGTERM");
	const terminated = await Promise.race([
		exited.then(() => true),
		delay(SHUTDOWN_TIMEOUT_MS).then(() => false),
	]);
	if (terminated) return;

	signalProcessGroup("SIGKILL");
	const killed = await Promise.race([
		exited.then(() => true),
		delay(SHUTDOWN_TIMEOUT_MS).then(() => false),
	]);
	if (!killed) {
		throw new Error(`Wrangler did not exit after SIGKILL.\n${wranglerLogs}`);
	}
}

async function startWrangler(): Promise<void> {
	const failures: string[] = [];
	for (let attempt = 1; attempt <= MAX_STARTUP_ATTEMPTS; attempt += 1) {
		const { inspectorPort, workerPort } = await allocateWranglerPorts();
		wranglerLogs = "";
		spawnWrangler(workerPort, inspectorPort);
		try {
			await waitForWranglerReady();
			return;
		} catch (error) {
			failures.push(
				`Attempt ${attempt} (${workerPort}/${inspectorPort}): ${String(error)}`,
			);
			await stopWrangler();
		}
	}
	throw new Error(
		`Wrangler failed to start after ${MAX_STARTUP_ATTEMPTS} attempts.\n${failures.join("\n\n")}`,
	);
}

function mcpHeaders(apiKey = VALID_API_KEY): Headers {
	return new Headers({
		accept: "application/json, text/event-stream",
		authorization: `Bearer ${apiKey}`,
		"content-type": "application/json",
	});
}

function initializeRequest(id = 1): Record<string, unknown> {
	return {
		jsonrpc: "2.0",
		id,
		method: "initialize",
		params: {
			protocolVersion: LATEST_PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: { name: "worker-http-integration", version: "1.0.0" },
		},
	};
}

async function postMcp(
	body: string,
	headers = mcpHeaders(),
): Promise<Response> {
	return fetch(`${workerBaseUrl}/mcp`, { method: "POST", headers, body });
}

interface SseEvent {
	data: string;
	event: string;
}

function parseSseEvents(payload: string): SseEvent[] {
	const events: SseEvent[] = [];
	let data: string[] = [];
	let event = "message";
	const dispatch = () => {
		if (data.length === 0) return;
		events.push({ data: data.join("\n"), event });
		data = [];
		event = "message";
	};

	for (const line of payload.replaceAll("\r\n", "\n").split("\n")) {
		if (line === "") {
			dispatch();
			continue;
		}
		if (line.startsWith(":")) continue;
		const separator = line.indexOf(":");
		const field = separator === -1 ? line : line.slice(0, separator);
		const rawValue = separator === -1 ? "" : line.slice(separator + 1);
		const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
		if (field === "data") data.push(value);
		else if (field === "event") event = value;
	}
	dispatch();
	return events;
}

async function parseSseMessage(response: Response): Promise<{
	event: string;
	payload: unknown;
}> {
	const rawPayload = await response.text();
	const events = parseSseEvents(rawPayload);
	if (events.length !== 1) {
		throw new Error(`Expected one SSE event, received ${events.length}`);
	}
	return {
		event: events[0]!.event,
		payload: JSON.parse(events[0]!.data) as unknown,
	};
}

describe.sequential("Wrangler-backed Worker HTTP integration", () => {
	beforeAll(
		async () => {
			redirectRecorderServer = createServer((request, response) => {
				redirectRequests.push({
					apiKey: request.headers["api-key"] as string | undefined,
					authorization: request.headers.authorization,
					method: request.method ?? "",
					url: request.url ?? "",
				});
				writeJson(response, 200, { data: { id: "redirected-user" } });
			});
			const redirectRecorderPort = await listen(
				redirectRecorderServer,
				"0.0.0.0",
			);
			redirectDestinationUrl = `http://${localNetworkAddress()}:${redirectRecorderPort}/redirect-target`;

			fakeHevyServer = createServer((request, response) => {
				hevyRequests.push({
					apiKey: request.headers["api-key"] as string | undefined,
					authorization: request.headers.authorization,
					method: request.method ?? "",
					url: request.url ?? "",
				});
				if (request.url !== "/v1/user/info" || request.method !== "GET") {
					writeJson(response, 404, { error: "not found" });
					return;
				}
				const apiKey = request.headers["api-key"];
				if (apiKey === INVALID_API_KEY) {
					writeJson(response, 401, { error: "invalid key" });
					return;
				}
				if (apiKey === UPSTREAM_FAILURE_API_KEY) {
					writeJson(response, 503, { error: "temporarily unavailable" });
					return;
				}
				if (apiKey === REDIRECT_API_KEY) {
					response.writeHead(302, { location: redirectDestinationUrl });
					response.end();
					return;
				}
				if (apiKey !== VALID_API_KEY) {
					writeJson(response, 403, { error: "forbidden" });
					return;
				}
				writeJson(response, 200, {
					data: {
						id: "fake-user-id",
						name: "Fake Hevy User",
						url: "https://hevy.com/user/fake-user-id",
					},
				});
			});
			const fakeHevyPort = await listen(fakeHevyServer, "0.0.0.0");
			fakeHevyBaseUrl = `http://${localNetworkAddress()}:${fakeHevyPort}`;

			try {
				await startWrangler();
			} catch (error) {
				await stopWrangler();
				await Promise.all([
					close(fakeHevyServer),
					close(redirectRecorderServer),
				]);
				throw error;
			}
		},
		MAX_STARTUP_ATTEMPTS * STARTUP_TIMEOUT_MS + 15_000,
	);

	afterAll(async () => {
		try {
			await stopWrangler();
		} finally {
			await Promise.all([close(fakeHevyServer), close(redirectRecorderServer)]);
		}
	}, 10_000);

	beforeEach(() => {
		hevyRequests.length = 0;
		redirectRequests.length = 0;
	});

	it("routes requests and returns stateless SSE initialize responses", async () => {
		const notFound = await fetch(`${workerBaseUrl}/unknown`);
		expect(notFound.status).toBe(404);

		const response = await postMcp(JSON.stringify(initializeRequest()));
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");
		expect(response.headers.get("mcp-session-id")).toBeNull();
		const event = await parseSseMessage(response);
		expect(event.event).toBe("message");
		expect(event.payload).toMatchObject({
			jsonrpc: "2.0",
			id: 1,
			result: { protocolVersion: LATEST_PROTOCOL_VERSION },
		});
		expect(hevyRequests).toEqual([
			expect.objectContaining({
				apiKey: VALID_API_KEY,
				authorization: undefined,
				method: "GET",
				url: "/v1/user/info",
			}),
		]);
	});

	it("does not follow authentication redirects or leak the API key", async () => {
		const response = await postMcp(
			JSON.stringify(initializeRequest()),
			mcpHeaders(REDIRECT_API_KEY),
		);

		expect(response.status).toBe(502);
		expect(await response.text()).toBe("Hevy API is temporarily unavailable");
		expect(hevyRequests).toEqual([
			expect.objectContaining({
				apiKey: REDIRECT_API_KEY,
				url: "/v1/user/info",
			}),
		]);
		expect(redirectRequests).toHaveLength(0);
		expect(
			hevyRequests.some((request) => request.url.includes(REDIRECT_API_KEY)),
		).toBe(false);
		expect(wranglerLogs).not.toContain(REDIRECT_API_KEY);
		expect(wranglerLogs).not.toContain(redirectDestinationUrl);
	});

	it("supports SDK tool discovery and a real tool call through the override", async () => {
		const client = new Client({
			name: "worker-http-sdk-client",
			version: "1.0.0",
		});
		const transport = new StreamableHTTPClientTransport(
			new URL(`${workerBaseUrl}/mcp`),
			{
				requestInit: {
					headers: { authorization: `Bearer ${VALID_API_KEY}` },
				},
			},
		);
		try {
			await client.connect(transport);
			const tools = await client.listTools();
			expect(tools.tools.map((tool) => tool.name)).toContain("get-user-info");

			const requestsBeforeToolCall = hevyRequests.length;
			const result = await client.callTool({
				name: "get-user-info",
				arguments: {},
			});
			expect(JSON.stringify(result)).toContain("fake-user-id");
			expect(hevyRequests.length - requestsBeforeToolCall).toBe(2);
			expect(transport.sessionId).toBeUndefined();
			expect(
				hevyRequests.every((request) => request.apiKey === VALID_API_KEY),
			).toBe(true);
			expect(
				hevyRequests.every(
					(request) =>
						request.authorization === undefined &&
						!request.url.includes(VALID_API_KEY),
				),
			).toBe(true);
		} finally {
			await client.close();
		}
	});

	it("rejects missing and malformed bearer credentials without upstream calls", async () => {
		const missingHeaders = mcpHeaders();
		missingHeaders.delete("authorization");
		const malformedHeaders = mcpHeaders();
		malformedHeaders.set("authorization", "Bearer key with spaces");

		const missing = await postMcp(
			JSON.stringify(initializeRequest()),
			missingHeaders,
		);
		const malformed = await postMcp(
			JSON.stringify(initializeRequest()),
			malformedHeaders,
		);

		expect(missing.status).toBe(401);
		expect(missing.headers.get("www-authenticate")).toBe("Bearer");
		expect(malformed.status).toBe(401);
		expect(hevyRequests).toHaveLength(0);
	});

	it("maps invalid upstream credentials to 401 and upstream failures to 502", async () => {
		const invalid = await postMcp(
			JSON.stringify(initializeRequest()),
			mcpHeaders(INVALID_API_KEY),
		);
		const unavailable = await postMcp(
			JSON.stringify(initializeRequest()),
			mcpHeaders(UPSTREAM_FAILURE_API_KEY),
		);

		expect(invalid.status).toBe(401);
		expect(invalid.headers.get("www-authenticate")).toBe("Bearer");
		expect(unavailable.status).toBe(502);
		expect(hevyRequests.map((request) => request.apiKey)).toEqual([
			INVALID_API_KEY,
			UPSTREAM_FAILURE_API_KEY,
		]);
	});

	it("returns MCP errors for unacceptable, unsupported, and invalid JSON requests", async () => {
		const unacceptableHeaders = mcpHeaders();
		unacceptableHeaders.set("accept", "application/json");
		const unsupportedHeaders = mcpHeaders();
		unsupportedHeaders.set("content-type", "text/plain");

		const unacceptable = await postMcp(
			JSON.stringify(initializeRequest()),
			unacceptableHeaders,
		);
		const unsupported = await postMcp(
			JSON.stringify(initializeRequest()),
			unsupportedHeaders,
		);
		const invalidJson = await postMcp("{", mcpHeaders());

		expect(unacceptable.status).toBe(406);
		expect(await unacceptable.json()).toMatchObject({
			error: { code: -32000 },
		});
		expect(unsupported.status).toBe(415);
		expect(await unsupported.json()).toMatchObject({ error: { code: -32000 } });
		expect(invalidJson.status).toBe(400);
		expect(await invalidJson.json()).toMatchObject({ error: { code: -32700 } });
		expect(hevyRequests).toHaveLength(3);
	});

	it("allows configured CORS preflight and denies other origins", async () => {
		const allowed = await fetch(`${workerBaseUrl}/mcp`, {
			method: "OPTIONS",
			headers: { origin: ALLOWED_ORIGIN },
		});
		const denied = await fetch(`${workerBaseUrl}/mcp`, {
			method: "OPTIONS",
			headers: { origin: "https://denied.example" },
		});

		expect(allowed.status).toBe(204);
		expect(allowed.headers.get("access-control-allow-origin")).toBe(
			ALLOWED_ORIGIN,
		);
		expect(allowed.headers.get("access-control-allow-methods")).toBe(
			"POST, OPTIONS",
		);
		expect(denied.status).toBe(403);
		expect(denied.headers.get("access-control-allow-origin")).toBeNull();
		expect(hevyRequests).toHaveLength(0);
	});

	it.each(["GET", "DELETE"])(
		"returns 405 for unsupported %s",
		async (method) => {
			const response = await fetch(`${workerBaseUrl}/mcp`, { method });
			expect(response.status).toBe(405);
			expect(response.headers.get("allow")).toBe("POST, OPTIONS");
			expect(hevyRequests).toHaveLength(0);
		},
	);
});
