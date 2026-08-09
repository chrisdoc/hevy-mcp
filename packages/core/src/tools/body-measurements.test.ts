/* oxlint-disable typescript/unbound-method */
import type { McpServer } from "@modelcontextprotocol/server";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import { describe, expect, it, vi } from "vitest";
import { createToolRuntime } from "./tool-runtime.js";
import { registerToolDefinition } from "./define-tool.js";
import { bodyMeasurementToolDefinitions } from "./body-measurements.js";

function register(client: HevyClient | null) {
	const tool = vi.fn();
	const server = { tool, registerTool: tool } as unknown as McpServer;
	const runtime = createToolRuntime({ client, catalog: {} as never });
	for (const definition of bodyMeasurementToolDefinitions)
		registerToolDefinition(server, runtime, definition);
	return tool;
}

function handler(tool: { mock: { calls: unknown[][] } }, name: string) {
	const call = tool.mock.calls.find(
		([registeredName]) => registeredName === name,
	);
	if (!call) throw new Error(`Tool ${name} was not registered`);
	return call.at(-1) as (args: object) => Promise<object>;
}

describe("body measurement tools", () => {
	it("maps snake_case list and date arguments to generated client methods", async () => {
		const client = {
			getBodyMeasurements: vi
				.fn()
				.mockResolvedValue({ body_measurements: [], page_count: 1 }),
			getBodyMeasurement: vi
				.fn()
				.mockResolvedValue({ date: "2025-01-01", weight_kg: 80 }),
		} as unknown as HevyClient;
		const tool = register(client);
		await handler(tool, "get-body-measurements")({ page: 2, page_size: 10 });
		await handler(tool, "get-body-measurement")({ date: "2025-01-01" });
		expect(client.getBodyMeasurements).toHaveBeenCalledWith({
			page: 2,
			pageSize: 10,
		});
		expect(client.getBodyMeasurement).toHaveBeenCalledWith("2025-01-01");
	});

	it("creates and updates numeric fields while omitting explicit nulls", async () => {
		const client = {
			createBodyMeasurement: vi.fn().mockResolvedValue(undefined),
			updateBodyMeasurement: vi.fn().mockResolvedValue(undefined),
		} as unknown as HevyClient;
		const tool = register(client);
		await handler(
			tool,
			"create-body-measurement",
		)({ date: "2025-01-01", weight_kg: 80, fat_percent: null });
		await handler(
			tool,
			"update-body-measurement",
		)({ date: "2025-01-01", lean_mass_kg: "60.5", fat_percent: null });
		expect(client.createBodyMeasurement).toHaveBeenCalledWith({
			date: "2025-01-01",
			weight_kg: 80,
		});
		expect(client.updateBodyMeasurement).toHaveBeenCalledWith("2025-01-01", {
			lean_mass_kg: 60.5,
		});
	});

	it("rejects camelCase measurement fields and effectively empty updates", async () => {
		const client = { updateBodyMeasurement: vi.fn() } as unknown as HevyClient;
		const tool = register(client);
		const definition = tool.mock.calls.find(
			([name]) => name === "update-body-measurement",
		)?.[1] as { inputSchema: { parse(value: unknown): unknown } };
		expect(() =>
			definition.inputSchema.parse({ date: "2025-01-01", weightKg: 80 }),
		).toThrow();
		const response = await handler(
			tool,
			"update-body-measurement",
		)({ date: "2025-01-01" });
		expect(response).toMatchObject({ isError: true });
		expect(client.updateBodyMeasurement).not.toHaveBeenCalled();
	});
});
