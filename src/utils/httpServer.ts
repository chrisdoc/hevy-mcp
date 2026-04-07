import { randomUUID } from "node:crypto";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB

type Session = {
	transport: StreamableHTTPServerTransport;
	server: McpServer;
};

function sendJsonError(
	res: ServerResponse,
	status: number,
	code: number,
	message: string,
): void {
	const body = JSON.stringify({
		jsonrpc: "2.0",
		error: { code, message },
		id: null,
	});
	res
		.writeHead(status, {
			"Content-Type": "application/json",
			"Content-Length": Buffer.byteLength(body).toString(),
		})
		.end(body);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let totalBytes = 0;
		let tooLarge = false;

		req.on("data", (chunk: Buffer) => {
			totalBytes += chunk.byteLength;
			if (totalBytes > MAX_BODY_BYTES) {
				tooLarge = true;
				// Keep draining so the socket stays intact for the 413 response
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			if (tooLarge) {
				reject(new Error("Request body too large"));
				return;
			}
			const raw = Buffer.concat(chunks).toString("utf8");
			try {
				resolve(raw ? JSON.parse(raw) : undefined);
			} catch {
				reject(new Error("Invalid JSON body"));
			}
		});
		req.on("error", reject);
	});
}

export function startHttpServer(
	buildServer: () => McpServer,
	port: number,
): Promise<Server> {
	const sessions = new Map<string, Session>();

	const httpServer = createServer(async (req, res) => {
		try {
			if (req.url !== "/mcp") {
				res.writeHead(404).end();
				return;
			}

			let body: unknown;
			if (req.method === "POST") {
				try {
					body = await readBody(req);
				} catch (err) {
					const msg = err instanceof Error ? err.message : "Bad request";
					const status = msg === "Request body too large" ? 413 : 400;
					sendJsonError(res, status, -32700, msg);
					return;
				}
			}

			const sessionIdHeader = req.headers["mcp-session-id"];
			const sessionId = Array.isArray(sessionIdHeader)
				? sessionIdHeader[0]
				: sessionIdHeader;

			if (sessionId && sessions.has(sessionId)) {
				await sessions.get(sessionId)!.transport.handleRequest(req, res, body);
				return;
			}

			if (!sessionId && req.method === "POST" && isInitializeRequest(body)) {
				let mcpServer: McpServer;
				const transport = new StreamableHTTPServerTransport({
					sessionIdGenerator: () => randomUUID(),
					onsessioninitialized: (id) => {
						sessions.set(id, { transport, server: mcpServer });
					},
				});
				transport.onclose = () => {
					if (transport.sessionId) sessions.delete(transport.sessionId);
				};
				mcpServer = buildServer();
				await mcpServer.connect(transport);
				await transport.handleRequest(req, res, body);
				return;
			}

			sendJsonError(res, 404, -32000, "Session not found");
		} catch {
			if (!res.headersSent) {
				sendJsonError(res, 500, -32603, "Internal error");
			}
		}
	});

	return new Promise((resolve, reject) => {
		httpServer.listen(port, () => resolve(httpServer));
		httpServer.on("error", reject);
	});
}
