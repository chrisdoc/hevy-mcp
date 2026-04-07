import type { Server } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startHttpServer } from "./httpServer.js";

function buildMinimalServer() {
	return new McpServer({ name: "test", version: "0.0.0" });
}

async function closeServer(server: Server): Promise<void> {
	return new Promise((resolve, reject) =>
		server.close((err) => (err ? reject(err) : resolve())),
	);
}

describe("startHttpServer", () => {
	let server: Server;
	let base: string;

	beforeEach(async () => {
		server = await startHttpServer(buildMinimalServer, 0);
		const addr = server.address();
		if (!addr || typeof addr === "string") throw new Error("No address");
		base = `http://localhost:${addr.port}`;
	});

	afterEach(() => closeServer(server));

	it("non-/mcp URL returns 404", async () => {
		const res = await fetch(`${base}/other`);
		expect(res.status).toBe(404);
	});

	it("/mcp with unknown session ID returns 404 JSON", async () => {
		const res = await fetch(`${base}/mcp`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"mcp-session-id": "unknown-session",
			},
			body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
		});
		expect(res.status).toBe(404);
		expect(res.headers.get("content-type")).toContain("application/json");
		const data = (await res.json()) as { error: { code: number } };
		expect(data.error.code).toBe(-32000);
	});

	it("oversized body returns 413", async () => {
		const res = await fetch(`${base}/mcp`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "x".repeat(1024 * 1024 + 1),
		});
		expect(res.status).toBe(413);
	});
});
