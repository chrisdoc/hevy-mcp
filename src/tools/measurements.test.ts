import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosError, type AxiosResponse } from "axios";
import { describe, expect, it, vi } from "vitest";
import type { BodyMeasurement } from "../generated/client/types/index.js";
import type { HevyClient } from "../utils/hevyClient.js";
import { registerMeasurementTools } from "./measurements.js";

type Handler = (args: Record<string, unknown>) => Promise<{
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
}>;

function setup(client: Partial<HevyClient> | null) {
	const tool = vi.fn();
	registerMeasurementTools(
		{ tool } as unknown as McpServer,
		client as HevyClient | null,
	);
	return (name: string): Handler => {
		const match = tool.mock.calls.find(([toolName]) => toolName === name);
		if (!match) throw new Error(`Tool ${name} was not registered`);
		return match[3] as Handler;
	};
}

function httpError(status: number) {
	return new AxiosError("Request failed", String(status), undefined, null, {
		status,
		data: { error: `status ${status}` },
	} as AxiosResponse);
}

const existing: BodyMeasurement = {
	date: "2025-01-15",
	weight_kg: 80,
	fat_percent: 18,
	waist: 82,
};

describe("registerMeasurementTools", () => {
	it("returns errors when the client is not initialized", async () => {
		const getTool = setup(null);
		for (const name of [
			"get-body-measurements",
			"get-body-measurement",
			"create-body-measurement",
			"update-body-measurement",
		]) {
			const response = await getTool(name)({
				date: "2025-01-15",
				weightKg: 80,
			});
			expect(response.isError).toBe(true);
			expect(response.content[0]?.text).toContain("API client not initialized");
		}
	});

	it("get-body-measurements formats entries with units in field names", async () => {
		const getBodyMeasurements = vi.fn().mockResolvedValue({
			page: 1,
			page_count: 3,
			body_measurements: [existing],
		});
		const getTool = setup({ getBodyMeasurements });

		const response = await getTool("get-body-measurements")({
			page: 1,
			pageSize: 10,
		});

		expect(getBodyMeasurements).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
		const parsed = JSON.parse(response.content[0]?.text ?? "{}");
		expect(parsed.pageCount).toBe(3);
		expect(parsed.bodyMeasurements[0]).toMatchObject({
			date: "2025-01-15",
			weightKg: 80,
			fatPercent: 18,
			waistCm: 82,
		});
	});

	it("get-body-measurement reports a missing date instead of an error", async () => {
		const getTool = setup({
			getBodyMeasurement: vi.fn().mockRejectedValue(httpError(404)),
		});

		const response = await getTool("get-body-measurement")({
			date: "2025-01-15",
		});

		expect(response.isError).toBeUndefined();
		expect(response.content[0]?.text).toContain("No body measurement found");
	});

	it("create-body-measurement sends snake_case fields and only provided values", async () => {
		const createBodyMeasurement = vi.fn().mockResolvedValue(undefined);
		const getTool = setup({ createBodyMeasurement });

		const response = await getTool("create-body-measurement")({
			date: "2025-01-15",
			weightKg: 80.5,
			leftCalfCm: 37,
		});

		expect(createBodyMeasurement).toHaveBeenCalledWith({
			date: "2025-01-15",
			weight_kg: 80.5,
			left_calf: 37,
		});
		expect(response.content[0]?.text).toContain("created");
	});

	it("create-body-measurement points to update on a 409 conflict", async () => {
		const getTool = setup({
			createBodyMeasurement: vi.fn().mockRejectedValue(httpError(409)),
		});

		const response = await getTool("create-body-measurement")({
			date: "2025-01-15",
			weightKg: 80,
		});

		expect(response.content[0]?.text).toContain("update-body-measurement");
	});

	it("create-body-measurement requires at least one value", async () => {
		const createBodyMeasurement = vi.fn();
		const getTool = setup({ createBodyMeasurement });

		const response = await getTool("create-body-measurement")({
			date: "2025-01-15",
		});

		expect(response.isError).toBe(true);
		expect(createBodyMeasurement).not.toHaveBeenCalled();
	});

	it("update-body-measurement merges changes into the existing entry", async () => {
		const updateBodyMeasurement = vi.fn().mockResolvedValue(undefined);
		const getTool = setup({
			getBodyMeasurement: vi.fn().mockResolvedValue(existing),
			updateBodyMeasurement,
		});

		await getTool("update-body-measurement")({
			date: "2025-01-15",
			weightKg: 79,
			fatPercent: null,
		});

		const [date, body] = updateBodyMeasurement.mock.calls[0] ?? [];
		expect(date).toBe("2025-01-15");
		// Changed and cleared values
		expect(body.weight_kg).toBe(79);
		expect(body.fat_percent).toBeNull();
		// Untouched existing value is preserved rather than nulled
		expect(body.waist).toBe(82);
		expect(body).not.toHaveProperty("date");
	});

	it("update-body-measurement points to create when no entry exists", async () => {
		const updateBodyMeasurement = vi.fn();
		const getTool = setup({
			getBodyMeasurement: vi.fn().mockRejectedValue(httpError(404)),
			updateBodyMeasurement,
		});

		const response = await getTool("update-body-measurement")({
			date: "2025-01-15",
			weightKg: 79,
		});

		expect(response.content[0]?.text).toContain("create-body-measurement");
		expect(updateBodyMeasurement).not.toHaveBeenCalled();
	});
});
