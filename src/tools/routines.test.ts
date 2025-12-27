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

	it("create-routine sends folder_id as null when folderId is omitted", async () => {
		const { server, tool } = createMockServer();
		const routine: Routine = {
			id: "created-routine",
			title: "No Folder",
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

		await handler({
			title: "No Folder",
			exercises: [
				{
					exerciseTemplateId: "template-id",
					sets: [{ type: "normal" as const, weight: 70, reps: 8 }],
				},
			],
		} as Record<string, unknown>);

		expect(hevyClient.createRoutine).toHaveBeenCalledWith({
			routine: expect.objectContaining({
				title: "No Folder",
				folder_id: null,
			}),
		});
	});

	it("update-routine preserves folder_id when folderId is omitted", async () => {
		const { server, tool } = createMockServer();
		const existingRoutine: Routine = {
			id: "routine-123",
			title: "Existing",
			folder_id: 321,
			created_at: "2025-03-26T19:00:00Z",
			updated_at: "2025-03-26T19:00:00Z",
			exercises: [],
		};
		const updatedRoutine: Routine = {
			...existingRoutine,
			title: "Updated",
			updated_at: "2025-03-26T19:30:00Z",
		};
		const hevyClient: HevyClient = {
			getRoutineById: vi.fn().mockResolvedValue({ routine: existingRoutine }),
			updateRoutine: vi.fn().mockResolvedValue(updatedRoutine),
		} as unknown as HevyClient;

		registerRoutineTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "update-routine");

		await handler({
			routineId: "routine-123",
			title: "Updated",
			exercises: [
				{
					exerciseTemplateId: "template-id",
					sets: [{ type: "normal" as const, weight: 70, reps: 8 }],
				},
			],
		} as Record<string, unknown>);

		expect(hevyClient.getRoutineById).toHaveBeenCalledWith("routine-123");
		expect(hevyClient.updateRoutine).toHaveBeenCalledWith("routine-123", {
			routine: expect.objectContaining({
				title: "Updated",
				folder_id: 321,
			}),
		});
	});

	it("update-routine uses the provided folderId without extra lookup", async () => {
		const { server, tool } = createMockServer();
		const routine: Routine = {
			id: "routine-123",
			title: "Updated",
			folder_id: 456,
			created_at: "2025-03-26T19:00:00Z",
			updated_at: "2025-03-26T19:30:00Z",
			exercises: [],
		};
		const hevyClient: HevyClient = {
			getRoutineById: vi.fn(),
			updateRoutine: vi.fn().mockResolvedValue(routine),
		} as unknown as HevyClient;

		registerRoutineTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "update-routine");

		await handler({
			routineId: "routine-123",
			title: "Updated",
			folderId: 456,
			exercises: [
				{
					exerciseTemplateId: "template-id",
					sets: [{ type: "normal" as const, weight: 70, reps: 8 }],
				},
			],
		} as Record<string, unknown>);

		expect(hevyClient.getRoutineById).not.toHaveBeenCalled();
		expect(hevyClient.updateRoutine).toHaveBeenCalledWith("routine-123", {
			routine: expect.objectContaining({
				folder_id: 456,
			}),
		});
	});

	it("update-routine returns an empty response when the routine does not exist", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			getRoutineById: vi.fn().mockResolvedValue(null),
			updateRoutine: vi.fn(),
		} as unknown as HevyClient;

		registerRoutineTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "update-routine");

		const response = await handler({
			routineId: "missing-routine",
			title: "Updated",
			exercises: [
				{
					exerciseTemplateId: "template-id",
					sets: [{ type: "normal" as const, weight: 70, reps: 8 }],
				},
			],
		} as Record<string, unknown>);

		expect(hevyClient.updateRoutine).not.toHaveBeenCalled();
		expect(response).toMatchObject({
			content: [
				{
					type: "text",
					text: "Routine with ID missing-routine not found",
				},
			],
		});
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
