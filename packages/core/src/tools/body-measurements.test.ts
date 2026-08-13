/* oxlint-disable typescript/unbound-method */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	createMockHevyClient,
	createMockMcpServer,
} from "../../test-fixtures/mock-hevy.js";
import { createToolRuntime } from "./tool-runtime.js";
import { registerToolDefinition } from "./define-tool.js";
import { bodyMeasurementToolDefinitions } from "./body-measurements.js";

type BodyMeasurementToolArgs = Parameters<
	(typeof bodyMeasurementToolDefinitions)[number]["execute"]
>[1];

function register(client: ReturnType<typeof createMockHevyClient> | null) {
	const { server, registerTool: tool } = createMockMcpServer();
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
	return call.at(-1) as <TArgs extends BodyMeasurementToolArgs>(
		args: TArgs,
	) => Promise<object>;
}

describe("body measurement tools", () => {
	it("maps snake_case list and date arguments to generated client methods", async () => {
		const client = createMockHevyClient();
		client.getBodyMeasurements.mockResolvedValue({
			body_measurements: [],
			page_count: 1,
		});
		client.getBodyMeasurement.mockResolvedValue({
			date: "2025-01-01",
			weight_kg: 80,
		});
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
		const client = createMockHevyClient();
		client.createBodyMeasurement.mockImplementation(() => undefined);
		client.updateBodyMeasurement.mockImplementation(() => undefined);
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
		const client = createMockHevyClient();
		const tool = register(client);
		const registration = tool.mock.calls.find(
			([name]) => name === "update-body-measurement",
		);
		if (!registration) throw new Error("Tool was not registered");
		const inputSchema = registration[1]?.inputSchema;
		if (!inputSchema) throw new Error("Tool input schema is missing");
		const parsedInputSchema = z.instanceof(z.ZodType).parse(inputSchema);
		expect(() =>
			parsedInputSchema.parse({ date: "2025-01-01", weightKg: 80 }),
		).toThrow();
		const response = await handler(
			tool,
			"update-body-measurement",
		)({ date: "2025-01-01" });
		expect(response).toMatchObject({ isError: true });
		expect(client.updateBodyMeasurement).not.toHaveBeenCalled();
	});
});
