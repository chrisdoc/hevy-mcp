import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import type { Routine } from "../generated/client/types/index.js";
import { formatRoutine } from "../utils/formatters.js";
import { registerRoutineTools } from "./routines.js";

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

describe("registerRoutineTools", () => {
	it("returns error responses when Hevy client is not initialized", async () => {
		const { server, tool } = createMockServer();
		registerRoutineTools(server, null);

		const toolNames = [
			"get-routines",
			"get-routine",
			"create-routine",
			"update-routine",
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

	it("get-routines returns formatted routines from the client", async () => {
		const { server, tool } = createMockServer();
		const routine: Routine = {
			id: "r1",
			title: "Push Day",
			folder_id: 123,
			created_at: "2025-03-26T19:00:00Z",
			updated_at: "2025-03-26T19:30:00Z",
			exercises: [],
		};
		const hevyClient: HevyClient = {
			getRoutines: vi.fn().mockResolvedValue({ routines: [routine] }),
		} as unknown as HevyClient;

		registerRoutineTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-routines");

		const response = await handler({ page: 1, pageSize: 5 });

		expect(hevyClient.getRoutines).toHaveBeenCalledWith({
			page: 1,
			pageSize: 5,
		});

		const parsed = JSON.parse(response.content[0].text) as unknown[];
		expect(parsed).toEqual([formatRoutine(routine)]);
	});

	it("create-routine maps arguments to the request body and formats the response", async () => {
		const { server, tool } = createMockServer();
		const routine: Routine = {
			id: "created-routine",
			title: "Pull Day",
			folder_id: null,
			created_at: "2025-03-26T19:00:00Z",
			updated_at: "2025-03-26T19:00:00Z",
			exercises: [],
		};
		const hevyClient: HevyClient = {
			createRoutine: vi.fn().mockResolvedValue(routine),
		} as unknown as HevyClient;

		registerRoutineTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "create-routine");

		const args = {
			title: "Pull Day",
			folderId: null,
			notes: "Back and biceps",
			exercises: [
				{
					exerciseTemplateId: "template-id",
					supersetId: null,
					restSeconds: 60,
					notes: "Slow eccentric",
					sets: [
						{
							type: "normal" as const,
							weight: 80,
							reps: 8,
							distance: null,
							duration: null,
							customMetric: null,
						},
					],
				},
			],
		};

		const response = await handler(args as Record<string, unknown>);

		expect(hevyClient.createRoutine).toHaveBeenCalledWith({
			routine: {
				title: "Pull Day",
				folder_id: null,
				notes: "Back and biceps",
				exercises: [
					{
						exercise_template_id: "template-id",
						superset_id: null,
						rest_seconds: 60,
						notes: "Slow eccentric",
						sets: [
							{
								type: "normal",
								weight_kg: 80,
								reps: 8,
								distance_meters: null,
								duration_seconds: null,
								custom_metric: null,
								rep_range: null,
							},
						],
					},
				],
			},
		});

		const parsed = JSON.parse(response.content[0].text) as unknown;
		expect(parsed).toEqual(formatRoutine(routine));
	});

	it("create-routine maps repRange to rep_range in the request body", async () => {
		const { server, tool } = createMockServer();
		const routine: Routine = {
			id: "created-routine",
			title: "Leg Day",
			folder_id: null,
			created_at: "2025-03-26T19:00:00Z",
			updated_at: "2025-03-26T19:00:00Z",
			exercises: [],
		};
		const hevyClient: HevyClient = {
			createRoutine: vi.fn().mockResolvedValue(routine),
		} as unknown as HevyClient;

		registerRoutineTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "create-routine");

		const args = {
			title: "Leg Day",
			folderId: null,
			notes: "Focus on form",
			exercises: [
				{
					exerciseTemplateId: "template-id",
					supersetId: null,
					restSeconds: 90,
					notes: "Slow and controlled",
					sets: [
						{
							type: "normal" as const,
							weightKg: 100,
							reps: 10,
							repRange: {
								start: 8,
								end: 12,
							},
						},
					],
				},
			],
		};

		await handler(args as Record<string, unknown>);

		expect(hevyClient.createRoutine).toHaveBeenCalledWith({
			routine: {
				title: "Leg Day",
				folder_id: null,
				notes: "Focus on form",
				exercises: [
					{
						exercise_template_id: "template-id",
						superset_id: null,
						rest_seconds: 90,
						notes: "Slow and controlled",
						sets: [
							{
								type: "normal",
								weight_kg: 100,
								reps: 10,
								distance_meters: null,
								duration_seconds: null,
								custom_metric: null,
								rep_range: {
									start: 8,
									end: 12,
								},
							},
						],
					},
				],
			},
		});
	});
});
