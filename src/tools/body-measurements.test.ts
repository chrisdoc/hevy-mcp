import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import type { BodyMeasurement } from "../generated/client/types/index.js";
import { formatBodyMeasurement } from "../utils/formatters.js";
import { registerBodyMeasurementTools } from "./body-measurements.js";

type HevyClient = ReturnType<
	typeof import("../utils/hevyClientKubb.js").createClient
>;

function createMockServer() {
	const tool = vi.fn();
	const server = { tool } as unknown as McpServer;
	return { server, tool };
}

function getToolRegistration(toolSpy: ReturnType<typeof vi.fn>, name: string) {
	const match = toolSpy.mock.calls.find(([toolName]) => toolName === name);
	if (!match) {
		throw new Error(`Tool ${name} was not registered`);
	}
	const [, , , handler] = match as [
		string,
		string,
		Record<string, unknown>,
		(args: Record<string, unknown>) => Promise<{
			content: Array<{ type: string; text: string }>;
			isError?: boolean;
		}>,
	];
	return { handler };
}

const sampleMeasurement: BodyMeasurement = {
	date: "2025-03-25",
	weight_kg: 80.5,
	lean_mass_kg: 65.0,
	fat_percent: 19.3,
	neck_cm: 38.0,
	shoulder_cm: 120.0,
	chest_cm: 100.0,
	left_bicep_cm: 35.0,
	right_bicep_cm: 35.5,
	left_forearm_cm: 28.0,
	right_forearm_cm: 28.5,
	abdomen: 85.0,
	waist: 82.0,
	hips: 95.0,
	left_thigh: 58.0,
	right_thigh: 58.5,
	left_calf: 38.0,
	right_calf: 38.0,
};

describe("registerBodyMeasurementTools", () => {
	it("returns error responses when Hevy client is not initialized", async () => {
		const { server, tool } = createMockServer();
		registerBodyMeasurementTools(server, null);

		const toolNames = [
			"get-body-measurements",
			"get-body-measurement",
			"create-body-measurement",
			"update-body-measurement",
		];

		for (const name of toolNames) {
			const { handler } = getToolRegistration(tool, name);
			const response = await handler({});
			expect(response).toMatchObject({
				isError: true,
				content: [
					{
						type: "text",
						text: expect.stringContaining(
							"API client not initialized. Please provide HEVY_API_KEY.",
						),
					},
				],
			});
		}
	});

	it("get-body-measurements returns formatted measurements from the client", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			getBodyMeasurements: vi.fn().mockResolvedValue({
				body_measurements: [sampleMeasurement],
			}),
		} as unknown as HevyClient;

		registerBodyMeasurementTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-body-measurements");

		const response = await handler({ page: 1, pageSize: 10 });

		expect(hevyClient.getBodyMeasurements).toHaveBeenCalledWith({
			page: 1,
			pageSize: 10,
		});

		const parsed = JSON.parse(response.content[0].text) as unknown[];
		expect(parsed).toEqual([formatBodyMeasurement(sampleMeasurement)]);
	});

	it("get-body-measurements returns empty response when no measurements found", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			getBodyMeasurements: vi.fn().mockResolvedValue({ body_measurements: [] }),
		} as unknown as HevyClient;

		registerBodyMeasurementTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-body-measurements");

		const response = await handler({ page: 1, pageSize: 10 });
		expect(response.content[0]?.text).toBe(
			"No body measurements found for the specified parameters",
		);
	});

	it("get-body-measurement returns a formatted measurement for a given date", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			getBodyMeasurement: vi.fn().mockResolvedValue(sampleMeasurement),
		} as unknown as HevyClient;

		registerBodyMeasurementTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-body-measurement");

		const response = await handler({ date: "2025-03-25" });

		expect(hevyClient.getBodyMeasurement).toHaveBeenCalledWith("2025-03-25");

		const parsed = JSON.parse(response.content[0].text) as unknown;
		expect(parsed).toEqual(formatBodyMeasurement(sampleMeasurement));
	});

	it("get-body-measurement returns empty response when not found", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			getBodyMeasurement: vi.fn().mockResolvedValue(null),
		} as unknown as HevyClient;

		registerBodyMeasurementTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-body-measurement");

		const response = await handler({ date: "2099-01-01" });
		expect(response.content[0]?.text).toBe(
			"No body measurement found for date 2099-01-01",
		);
	});

	it("create-body-measurement sends correct payload to the client", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			createBodyMeasurement: vi.fn().mockResolvedValue(undefined),
		} as unknown as HevyClient;

		registerBodyMeasurementTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "create-body-measurement");

		const response = await handler({
			date: "2025-04-01",
			weightKg: 81.0,
			fatPercent: 18.5,
		});

		expect(hevyClient.createBodyMeasurement).toHaveBeenCalledWith({
			date: "2025-04-01",
			weight_kg: 81.0,
			lean_mass_kg: null,
			fat_percent: 18.5,
			neck_cm: null,
			shoulder_cm: null,
			chest_cm: null,
			left_bicep_cm: null,
			right_bicep_cm: null,
			left_forearm_cm: null,
			right_forearm_cm: null,
			abdomen: null,
			waist: null,
			hips: null,
			left_thigh: null,
			right_thigh: null,
			left_calf: null,
			right_calf: null,
		});

		expect(response.content[0]?.text).toBe(
			"Body measurement for 2025-04-01 created successfully.",
		);
	});

	it("update-body-measurement sends correct payload to the client", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			updateBodyMeasurement: vi.fn().mockResolvedValue(undefined),
		} as unknown as HevyClient;

		registerBodyMeasurementTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "update-body-measurement");

		const response = await handler({
			date: "2025-03-25",
			weightKg: 79.5,
			chestCm: 101.0,
		});

		expect(hevyClient.updateBodyMeasurement).toHaveBeenCalledWith(
			"2025-03-25",
			{
				weight_kg: 79.5,
				lean_mass_kg: null,
				fat_percent: null,
				neck_cm: null,
				shoulder_cm: null,
				chest_cm: 101.0,
				left_bicep_cm: null,
				right_bicep_cm: null,
				left_forearm_cm: null,
				right_forearm_cm: null,
				abdomen: null,
				waist: null,
				hips: null,
				left_thigh: null,
				right_thigh: null,
				left_calf: null,
				right_calf: null,
			},
		);

		expect(response.content[0]?.text).toBe(
			"Body measurement for 2025-03-25 updated successfully.",
		);
	});
});
