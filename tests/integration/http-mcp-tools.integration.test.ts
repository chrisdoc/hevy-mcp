import { config } from "dotenv";

config();

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { registerFolderTools } from "../../src/tools/folders.js";
import { registerRoutineTools } from "../../src/tools/routines.js";
import { registerTemplateTools } from "../../src/tools/templates.js";
import { registerWebhookTools } from "../../src/tools/webhooks.js";
import { registerWorkoutTools } from "../../src/tools/workouts.js";
import { createClient } from "../../src/utils/hevyClient.js";
import { createHttpServer } from "../../src/utils/httpServer.js";

const HEVY_API_BASEURL = "https://api.hevyapp.com";

// Zod schemas for validating MCP responses
const McpErrorSchema = z.object({
	code: z.number(),
	message: z.string(),
});

const McpToolCallResponseSchema = z.object({
	jsonrpc: z.literal("2.0"),
	id: z.union([z.string(), z.number()]),
	result: z
		.object({
			content: z.array(
				z.object({
					type: z.literal("text"),
					text: z.string(),
				}),
			),
			isError: z.boolean().optional(),
		})
		.optional(),
	error: McpErrorSchema.optional(),
});

describe("HTTP MCP Tools Integration Tests", () => {
	let server: McpServer;
	let httpServer: ReturnType<typeof createHttpServer>;
	let serverUrl: string;
	let sessionId: string | null = null;
	let hevyApiKey: string;
	let hasApiKey = false;

	beforeAll(async () => {
		hevyApiKey = process.env.HEVY_API_KEY || "";
		hasApiKey = !!hevyApiKey;

		if (!hasApiKey) {
			throw new Error(
				"HEVY_API_KEY is not set in environment variables. HTTP MCP tools integration tests cannot run without a valid API key.\n\n" +
					"For local development:\n" +
					"1. Create a .env file in the project root\n" +
					"2. Add HEVY_API_KEY=your_api_key to the file\n\n" +
					"For GitHub Actions:\n" +
					"1. Go to your GitHub repository\n" +
					"2. Click on Settings > Secrets and variables > Actions\n" +
					"3. Click on New repository secret\n" +
					"4. Set the name to HEVY_API_KEY and the value to your Hevy API key\n" +
					"5. Click Add secret",
			);
		}

		// Create server instance
		server = new McpServer({
			name: "hevy-mcp-http-test",
			version: "1.0.0",
		});

		// Create Hevy client
		const hevyClient = createClient(hevyApiKey, HEVY_API_BASEURL);

		// Register all tools
		registerWorkoutTools(server, hevyClient);
		registerRoutineTools(server, hevyClient);
		registerTemplateTools(server, hevyClient);
		registerFolderTools(server, hevyClient);
		registerWebhookTools(server, hevyClient);

		// Create HTTP server
		httpServer = createHttpServer(server, {
			port: 3002, // Use different port to avoid conflicts
			host: "127.0.0.1",
		});

		// Start the server
		await httpServer.startServer();
		serverUrl = "http://127.0.0.1:3002";
	});

	afterAll(async () => {
		// Clean up session if it exists
		if (sessionId) {
			try {
				await fetch(`${serverUrl}/mcp?sessionId=${sessionId}`, {
					method: "DELETE",
				});
			} catch (_error) {
				// Ignore cleanup errors
			}
		}

		// Clean up all sessions
		httpServer?.closeAllSessions();
	});

	/**
	 * Helper function to create a new MCP session
	 */
	async function createSession(): Promise<string> {
		const response = await fetch(`${serverUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: {
						name: "hevy-mcp-http-test-client",
						version: "1.0.0",
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const sessionId = response.headers.get("x-session-id");
		expect(sessionId).toBeTruthy();
		return sessionId as string;
	}

	/**
	 * Helper function to call an MCP tool over HTTP
	 */
	async function callTool(
		sessionId: string,
		toolName: string,
		args: Record<string, unknown> = {},
		timeout = 15000,
	): Promise<{
		result?: { content: { type: string; text: string }[]; isError?: boolean };
		error?: { code: number; message: string };
	}> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			const response = await fetch(`${serverUrl}/mcp?sessionId=${sessionId}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: Math.random().toString(36).substr(2, 9),
					method: "tools/call",
					params: {
						name: toolName,
						arguments: args,
					},
				}),
				signal: controller.signal,
			});

			expect(response.status).toBe(200);
			const result = await response.json();
			McpToolCallResponseSchema.parse(result);
			return result;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	describe("Session Management", () => {
		it("should create a new MCP session and initialize", async () => {
			sessionId = await createSession();
			expect(sessionId).toBeTruthy();
		});

		it("should list available tools after initialization", async () => {
			if (!sessionId) {
				sessionId = await createSession();
			}

			const result = await callTool(sessionId, "tools/list", {});
			expect(result.result).toBeDefined();
			expect(result.result.content).toBeDefined();
			expect(result.result.content[0].text).toBeDefined();

			const toolsList = JSON.parse(result.result.content[0].text);
			expect(Array.isArray(toolsList.tools)).toBe(true);
			expect(toolsList.tools.length).toBeGreaterThan(0);

			// Verify some expected tools are present
			const toolNames = toolsList.tools.map(
				(tool: { name: string }) => tool.name,
			);
			expect(toolNames).toContain("get-workouts");
			expect(toolNames).toContain("get-routines");
			expect(toolNames).toContain("get-exercise-templates");
			expect(toolNames).toContain("get-routine-folders");
		});
	});

	describe("Workout Tools via HTTP", () => {
		it("should call get-workouts tool successfully", async () => {
			if (!sessionId) {
				sessionId = await createSession();
			}

			const result = await callTool(sessionId, "get-workouts", {
				page: 1,
				pageSize: 3,
			});

			expect(result.result).toBeDefined();
			expect(result.result.content).toBeDefined();
			expect(result.result.content[0].text).toBeDefined();

			const workouts = JSON.parse(result.result.content[0].text);
			expect(Array.isArray(workouts)).toBe(true);
			expect(workouts.length).toBeGreaterThanOrEqual(0);

			if (workouts.length > 0) {
				expect(workouts[0].id).toBeDefined();
				expect(workouts[0].title).toBeDefined();
				expect(workouts[0].createdAt).toBeDefined();
			}
		});

		it("should call get-workout-count tool successfully", async () => {
			if (!sessionId) {
				sessionId = await createSession();
			}

			const result = await callTool(sessionId, "get-workout-count", {});

			expect(result.result).toBeDefined();
			expect(result.result.content).toBeDefined();
			expect(result.result.content[0].text).toBeDefined();

			const countData = JSON.parse(result.result.content[0].text);
			expect(typeof countData.count).toBe("number");
			expect(countData.count).toBeGreaterThanOrEqual(0);
		});
	});

	describe("Routine Tools via HTTP", () => {
		it("should call get-routines tool successfully", async () => {
			if (!sessionId) {
				sessionId = await createSession();
			}

			const result = await callTool(sessionId, "get-routines", {
				page: 1,
				pageSize: 3,
			});

			expect(result.result).toBeDefined();
			expect(result.result.content).toBeDefined();
			expect(result.result.content[0].text).toBeDefined();

			const routines = JSON.parse(result.result.content[0].text);
			expect(Array.isArray(routines)).toBe(true);
			expect(routines.length).toBeGreaterThanOrEqual(0);

			if (routines.length > 0) {
				expect(routines[0].id).toBeDefined();
				expect(routines[0].title).toBeDefined();
			}
		});
	});

	describe("Template Tools via HTTP", () => {
		it("should call get-exercise-templates tool successfully", async () => {
			if (!sessionId) {
				sessionId = await createSession();
			}

			const result = await callTool(sessionId, "get-exercise-templates", {
				page: 1,
				pageSize: 5,
			});

			expect(result.result).toBeDefined();
			expect(result.result.content).toBeDefined();
			expect(result.result.content[0].text).toBeDefined();

			const templates = JSON.parse(result.result.content[0].text);
			expect(Array.isArray(templates)).toBe(true);
			expect(templates.length).toBeGreaterThanOrEqual(0);

			if (templates.length > 0) {
				expect(templates[0].id).toBeDefined();
				expect(templates[0].title).toBeDefined();
			}
		});
	});

	describe("Folder Tools via HTTP", () => {
		it("should call get-routine-folders tool successfully", async () => {
			if (!sessionId) {
				sessionId = await createSession();
			}

			const result = await callTool(sessionId, "get-routine-folders", {});

			expect(result.result).toBeDefined();
			expect(result.result.content).toBeDefined();
			expect(result.result.content[0].text).toBeDefined();

			const folders = JSON.parse(result.result.content[0].text);
			expect(Array.isArray(folders)).toBe(true);
			expect(folders.length).toBeGreaterThanOrEqual(0);

			if (folders.length > 0) {
				expect(folders[0].id).toBeDefined();
				expect(folders[0].title).toBeDefined();
			}
		});
	});

	describe("Error Handling via HTTP", () => {
		it("should handle invalid tool name gracefully", async () => {
			if (!sessionId) {
				sessionId = await createSession();
			}

			const result = await callTool(sessionId, "non-existent-tool", {});

			expect(result.error).toBeDefined();
			expect(result.error.code).toBe(-32601); // Method not found
			expect(result.error.message).toContain("Tool not found");
		});

		it("should handle invalid arguments gracefully", async () => {
			if (!sessionId) {
				sessionId = await createSession();
			}

			const result = await callTool(sessionId, "get-workouts", {
				page: "invalid", // Should be a number
				pageSize: -1, // Should be positive
			});

			// Should either return an error or handle invalid args gracefully
			if (result.error) {
				expect(result.error.code).toBeDefined();
				expect(result.error.message).toBeDefined();
			} else {
				// If it doesn't error, it should at least return a valid response
				expect(result.result).toBeDefined();
			}
		});
	});

	describe("Concurrent Requests via HTTP", () => {
		it("should handle multiple concurrent tool calls", async () => {
			if (!sessionId) {
				sessionId = await createSession();
			}

			// Make multiple concurrent requests
			const promises = [
				callTool(sessionId, "get-workouts", { page: 1, pageSize: 2 }),
				callTool(sessionId, "get-routines", { page: 1, pageSize: 2 }),
				callTool(sessionId, "get-exercise-templates", { page: 1, pageSize: 2 }),
				callTool(sessionId, "get-workout-count", {}),
			];

			const results = await Promise.all(promises);

			// All requests should succeed
			for (const result of results) {
				expect(result.result || result.error).toBeDefined();
				if (result.result) {
					expect(result.result.content).toBeDefined();
					expect(result.result.content[0].text).toBeDefined();
				}
			}
		});

		it("should handle multiple sessions concurrently", async () => {
			// Create multiple sessions
			const session1 = await createSession();
			const session2 = await createSession();

			try {
				// Make concurrent calls from different sessions
				const [result1, result2] = await Promise.all([
					callTool(session1, "get-workout-count", {}),
					callTool(session2, "get-workout-count", {}),
				]);

				// Both should succeed
				expect(result1.result).toBeDefined();
				expect(result2.result).toBeDefined();

				const count1 = JSON.parse(result1.result.content[0].text);
				const count2 = JSON.parse(result2.result.content[0].text);

				// Should return the same count (assuming no workouts are added during test)
				expect(count1.count).toBe(count2.count);
			} finally {
				// Clean up sessions
				await Promise.all([
					fetch(`${serverUrl}/mcp?sessionId=${session1}`, { method: "DELETE" }),
					fetch(`${serverUrl}/mcp?sessionId=${session2}`, { method: "DELETE" }),
				]);
			}
		});
	});
});
