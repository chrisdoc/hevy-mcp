#!/usr/bin/env node
import "@dotenvx/dotenvx/config";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response } from "express";
import { name, version } from "../package.json";
import { registerFolderTools } from "./tools/folders.js";
import { registerRoutineTools } from "./tools/routines.js";
import { registerTemplateTools } from "./tools/templates.js";
import { registerWebhookTools } from "./tools/webhooks.js";
// Import tool registration functions
import { registerWorkoutTools } from "./tools/workouts.js";
import { createClient } from "./utils/hevyClient.js";

const HEVY_API_BASEURL = "https://api.hevyapp.com";
const MCP_HTTP_PORT = process.env.MCP_HTTP_PORT
	? Number.parseInt(process.env.MCP_HTTP_PORT, 10)
	: undefined;

// Create server instance
const server = new McpServer({
	name,
	version,
});

// Check for API key
if (!process.env.HEVY_API_KEY) {
	console.error("HEVY_API_KEY environment variable is not set");
	process.exit(1);
}

// Configure client
// We've already checked for HEVY_API_KEY existence above, so it's safe to use here
const apiKey = process.env.HEVY_API_KEY || "";
const hevyClient = createClient(apiKey, HEVY_API_BASEURL);
// Register all tools
registerWorkoutTools(server, hevyClient);
registerRoutineTools(server, hevyClient);
registerTemplateTools(server, hevyClient);
registerFolderTools(server, hevyClient);
registerWebhookTools(server, hevyClient);

// Start the server with both STDIO and optional HTTP transport
async function runServer() {
	// Always start STDIO transport (existing behavior)
	const stdioTransport = new StdioServerTransport();
	await server.connect(stdioTransport);

	// Optionally start HTTP transport if port is configured
	if (MCP_HTTP_PORT) {
		await startHttpServer();
	}
}

// Helper function to create and configure a new server instance
function createConfiguredServer(): McpServer {
	const newServer = new McpServer({ name, version });

	// Register all tools on the new server
	registerWorkoutTools(newServer, hevyClient);
	registerRoutineTools(newServer, hevyClient);
	registerTemplateTools(newServer, hevyClient);
	registerFolderTools(newServer, hevyClient);
	registerWebhookTools(newServer, hevyClient);

	return newServer;
}

// HTTP server setup for Streamable HTTP transport
async function startHttpServer() {
	if (!MCP_HTTP_PORT) {
		return;
	}

	const app = express();
	app.use(express.json());

	// Map to store transports by session ID
	const transports: Record<string, StreamableHTTPServerTransport> = {};

	// MCP POST endpoint for JSON-RPC requests
	const mcpPostHandler = async (req: Request, res: Response) => {
		const sessionIdHeader = req.headers["mcp-session-id"];
		const sessionId = Array.isArray(sessionIdHeader)
			? sessionIdHeader[0]
			: sessionIdHeader;

		try {
			let transport: StreamableHTTPServerTransport;

			if (sessionId && transports[sessionId]) {
				// Reuse existing transport
				transport = transports[sessionId];
			} else if (!sessionId && isInitializeRequest(req.body)) {
				// New initialization request
				transport = new StreamableHTTPServerTransport({
					sessionIdGenerator: () => randomUUID(),
					onsessioninitialized: (sessionId: string) => {
						console.log(`HTTP session initialized: ${sessionId}`);
						transports[sessionId] = transport;
					},
				});

				// Set up cleanup when transport closes
				transport.onclose = () => {
					const sid = transport.sessionId;
					if (sid && transports[sid]) {
						console.log(`HTTP transport closed for session ${sid}`);
						delete transports[sid];
					}
				};

				// Create a new server instance for this HTTP session
				const httpServer = createConfiguredServer();

				// Connect the transport to the server
				await httpServer.connect(transport);
				await transport.handleRequest(req, res, req.body);
				return;
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

			// Handle request with existing transport
			await transport.handleRequest(req, res, req.body);
		} catch (error) {
			console.error("Error handling HTTP MCP request:", error);
			if (!res.headersSent) {
				res.status(500).json({
					jsonrpc: "2.0",
					error: {
						code: -32603,
						message: "Internal server error",
					},
					id: null,
				});
			}
		}
	};

	// MCP GET endpoint for SSE streams
	const mcpGetHandler = async (req: Request, res: Response) => {
		const sessionIdHeader = req.headers["mcp-session-id"];
		const sessionId = Array.isArray(sessionIdHeader)
			? sessionIdHeader[0]
			: sessionIdHeader;
		if (!sessionId || !transports[sessionId]) {
			res.status(400).send("Invalid or missing session ID");
			return;
		}

		const transport = transports[sessionId];
		await transport.handleRequest(req, res);
	};

	// MCP DELETE endpoint for session termination
	const mcpDeleteHandler = async (req: Request, res: Response) => {
		const sessionIdHeader = req.headers["mcp-session-id"];
		const sessionId = Array.isArray(sessionIdHeader)
			? sessionIdHeader[0]
			: sessionIdHeader;
		if (!sessionId || !transports[sessionId]) {
			res.status(400).send("Invalid or missing session ID");
			return;
		}

		try {
			const transport = transports[sessionId];
			await transport.handleRequest(req, res);
		} catch (error) {
			console.error("Error handling session termination:", error);
			if (!res.headersSent) {
				res.status(500).send("Error processing session termination");
			}
		}
	};

	// Register routes
	app.post("/mcp", mcpPostHandler);
	app.get("/mcp", mcpGetHandler);
	app.delete("/mcp", mcpDeleteHandler);

	// Start HTTP server
	const httpServer = app.listen(MCP_HTTP_PORT, () => {
		console.log(`MCP HTTP Server listening on port ${MCP_HTTP_PORT}`);
		console.log(`HTTP endpoint: http://localhost:${MCP_HTTP_PORT}/mcp`);
	});

	// Handle server shutdown
	const cleanup = async () => {
		console.log("Shutting down HTTP server...");
		// Close all active transports
		for (const sessionId in transports) {
			try {
				console.log(`Closing HTTP transport for session ${sessionId}`);
				await transports[sessionId].close();
				delete transports[sessionId];
			} catch (error) {
				console.error(
					`Error closing HTTP transport for session ${sessionId}:`,
					error,
				);
			}
		}

		// Close HTTP server
		return new Promise<void>((resolve) => {
			httpServer.close(() => {
				console.log("HTTP server closed");
				resolve();
			});
		});
	};

	// Store cleanup function for graceful shutdown
	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);
}

// Helper function to check if request is initialization request
function isInitializeRequest(body: unknown): body is { method: string } {
	return (
		body !== null &&
		typeof body === "object" &&
		"method" in body &&
		(body as { method: unknown }).method === "initialize"
	);
}

runServer().catch((error) => {
	console.error("Fatal error in main():", error);
	process.exit(1);
});
