import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { getCompactJsonSchemaConversionCount } from "../utils/compact-json-schema.js";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import { createToolRuntime } from "./tool-runtime.js";
import {
	hevyToolDefinitions,
	preloadHevyToolSchemas,
	registerHevyTools,
} from "./register.js";

const catalog: ExerciseTemplateCatalog = {
	get: () => Promise.resolve([]),
	reset: () => {},
};

/**
 * `preloadHevyToolSchemas` must run the real compact JSON Schema
 * conversions (the memoized `input`/`output` closures behind
 * `compactJsonSchema`), not just populate the config cache. Otherwise the
 * conversion cost lands back in the first request's `registerTool` call. This
 * file intentionally builds no server before the test so the per-isolate
 * conversion counter starts cold.
 */
describe("preloadHevyToolSchemas", () => {
	it("performs every tool schema conversion before any server is built and never repeats", async () => {
		// Cold module: nothing has converted yet.
		expect(getCompactJsonSchemaConversionCount()).toBe(0);

		// The first preload performs the actual conversions, before any server.
		preloadHevyToolSchemas();
		const afterFirstPreload = getCompactJsonSchemaConversionCount();
		expect(afterFirstPreload).toBeGreaterThan(0);

		// Idempotent: a second preload converts nothing new.
		preloadHevyToolSchemas();
		expect(getCompactJsonSchemaConversionCount()).toBe(afterFirstPreload);

		// Server construction only reads already-converted schemas.
		const server = new McpServer({ name: "preload-test", version: "1.0.0" });
		registerHevyTools(server, createToolRuntime({ client: null, catalog }));
		expect(getCompactJsonSchemaConversionCount()).toBe(afterFirstPreload);

		const protocolClient = new Client({
			name: "preload-test-client",
			version: "1.0.0",
		});
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await Promise.all([
			server.connect(serverTransport),
			protocolClient.connect(clientTransport),
		]);
		try {
			const { tools } = await protocolClient.listTools();
			expect(tools).toHaveLength(hevyToolDefinitions.length);
			expect(getCompactJsonSchemaConversionCount()).toBe(afterFirstPreload);
		} finally {
			await Promise.all([protocolClient.close(), server.close()]);
		}
	});
});
