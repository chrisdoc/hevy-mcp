import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";

// Map to store transports by session ID
const transports = new Map<
	string,
	{
		transport: StreamableHTTPServerTransport;
		lastActivity: number;
	}
>();

// Session timeout in milliseconds (30 minutes)
const SESSION_TIMEOUT = 30 * 60 * 1000;

// Periodic cleanup of abandoned sessions
setInterval(
	() => {
		const now = Date.now();
		for (const [sessionId, session] of transports) {
			if (now - session.lastActivity > SESSION_TIMEOUT) {
				console.log(`Cleaning up abandoned session: ${sessionId}`);
				session.transport.close?.();
				transports.delete(sessionId);
			}
		}
	},
	5 * 60 * 1000,
); // Run cleanup every 5 minutes

/**
 * Create and configure Express server for MCP HTTP transport
 */
export function createHttpServer(
	server: McpServer,
	options?: {
		port?: number;
		host?: string;
		enableDnsRebindingProtection?: boolean;
		allowedHosts?: string[];
	},
) {
	const app = express();
	const port = options?.port || 3000;
	const host = options?.host || "127.0.0.1";

	app.use(express.json());

	// Handle POST requests for client-to-server communication
	app.post("/mcp", async (req, res) => {
		// Check for existing session ID
		const sessionId = req.headers["mcp-session-id"] as string | undefined;
		let transport: StreamableHTTPServerTransport;

		if (sessionId && transports.has(sessionId)) {
			// Reuse existing transport
                        transport = transports.get(sessionId)!.transport;
                        transports.get(sessionId)!.lastActivity = Date.now();
		} else if (!sessionId && isInitializeRequest(req.body)) {
			// New initialization request
			transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				onsessioninitialized: (sessionId) => {
					// Store the transport by session ID
					transports.set(sessionId, { transport, lastActivity: Date.now() });
				},
				// DNS rebinding protection configuration
				enableDnsRebindingProtection:
					options?.enableDnsRebindingProtection ?? false,
				allowedHosts: options?.allowedHosts || ["127.0.0.1"],
			});

			// Clean up transport when closed
			transport.onclose = () => {
				if (transport.sessionId) {
					transports.delete(transport.sessionId!);
				}
			};

			// Connect to the MCP server
			await server.connect(transport);
		} else {
			// Invalid request
			res.status(400).json({
				jsonrpc: "2.0",
				error: {
					code: -32000,
					message: "Bad Request: No valid session ID provided",
				},
				id: null,
			});
			return;
		}

		// Handle the request
		await transport.handleRequest(req, res, req.body);
	});

	// Reusable handler for GET and DELETE requests
	const handleSessionRequest = async (
		req: express.Request,
		res: express.Response,
	) => {
		const sessionId = req.headers["mcp-session-id"] as string | undefined;
		if (!sessionId || !transports.has(sessionId)) {
			res.status(400).send("Invalid or missing session ID");
			return;
		}

		const transport = transports.get(sessionId)?.transport;
		await transport.handleRequest(req, res);
	};

	// Handle GET requests for server-to-client notifications via SSE
	app.get("/mcp", handleSessionRequest);

	// Handle DELETE requests for session termination
	app.delete("/mcp", handleSessionRequest);

	// Health check endpoint
	app.get("/health", (_req, res) => {
		res.json({ status: "ok", timestamp: new Date().toISOString() });
	});

	// Start the server
	const startServer = () => {
		return new Promise<void>((resolve, reject) => {
			const httpServer = app.listen(port, host, () => {
				console.log(`MCP HTTP server listening on http://${host}:${port}`);
				console.log(`MCP endpoint: http://${host}:${port}/mcp`);
				console.log(`Health check: http://${host}:${port}/health`);
				resolve();
			});

			httpServer.on("error", (error) => {
				reject(error);
			});
		});
	};

	return {
		app,
		startServer,
		getActiveSessionsCount: () => transports.size,
		closeAllSessions: () => {
			for (const session of transports.values()) {
				session.transport.close?.();
			}
			transports.clear();
		},
	};
}
