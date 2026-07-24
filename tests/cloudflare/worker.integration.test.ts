/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("Cloudflare Worker integration", () => {
	it("serves OAuth discovery metadata from the configured Worker", async () => {
		const response = await exports.default.fetch(
			"https://worker.example/.well-known/oauth-authorization-server",
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			authorization_endpoint: "https://worker.example/authorize",
			token_endpoint: "https://worker.example/token",
			registration_endpoint: "https://worker.example/register",
			scopes_supported: ["mcp"],
			client_id_metadata_document_supported: true,
		});
	});

	it("returns an OAuth challenge for an unauthenticated MCP request", async () => {
		const response = await exports.default.fetch("https://worker.example/mcp", {
			method: "POST",
			body: "{}",
		});

		expect(response.status).toBe(401);
		expect(response.headers.get("www-authenticate")).toContain(
			'resource_metadata="https://worker.example/.well-known/oauth-protected-resource/mcp"',
		);
	});
});
