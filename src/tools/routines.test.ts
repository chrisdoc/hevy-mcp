import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
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
	const [, , schema, handler] = match as [
		string,
		string,
		Record<string, z.ZodTypeAny>,
		(args: Record<string, unknown>) => Promise<{
			content: Array<{ type: string; text: string }>;
			isError?: boolean;
		}>,
	];
	return { schema, handler };
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

	it("create-routine copies reps from fixed repRange when reps is omitted", async () => {
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

		const response = await handler({
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
							repRange: { start: 8, end: 8 },
						},
					],
				},
			],
		} as Record<string, unknown>);

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
								reps: 8,
								distance_meters: null,
								duration_seconds: null,
								custom_metric: null,
								rep_range: {
									start: 8,
									end: 8,
								},
							},
						],
					},
				],
			},
		});

		expect(response.content).toHaveLength(1);
	});

	it("create-routine copies reps from fixed repRange when reps is null", async () => {
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

		const response = await handler({
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
							reps: null,
							repRange: { start: 8, end: 8 },
						},
					],
				},
			],
		} as Record<string, unknown>);

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
								reps: 8,
								distance_meters: null,
								duration_seconds: null,
								custom_metric: null,
								rep_range: {
									start: 8,
									end: 8,
								},
							},
						],
					},
				],
			},
		});

		expect(response.content).toHaveLength(1);
	});

	it("create-routine includes a rep range display warning when repRange is provided", async () => {
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

		const response = await handler({
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
							repRange: { start: 8, end: 12 },
						},
					],
				},
			],
		} as Record<string, unknown>);

		expect(hevyClient.createRoutine).toHaveBeenCalledWith(
			expect.objectContaining({
				routine: expect.objectContaining({
					exercises: [
						expect.objectContaining({
							sets: [
								expect.objectContaining({
									reps: null,
									rep_range: { start: 8, end: 12 },
								}),
							],
						}),
					],
				}),
			}),
		);

		expect(response.content).toHaveLength(2);
		expect(JSON.parse(response.content[0].text)).toEqual(
			formatRoutine(routine),
		);
		expect(response.content[1]?.text).toContain("rep ranges");
		expect(response.content[1]?.text).toContain("issues/261");
	});

	it("create-routine unwraps {routine: [...]} mutation response", async () => {
		// Regression test: the Hevy API returns POST /v1/routines as
		// `{ routine: [Routine] }` (a one-element array nested under a
		// `routine` key), but the generated OpenAPI types claim the response
		// IS a Routine. The handler must defensively unwrap so the tool
		// returns the actual routine object, not "{}".
		const { server, tool } = createMockServer();
		const routine: Routine = {
			id: "created-routine",
			title: "Wrapped Response",
			folder_id: null,
			created_at: "2025-03-26T19:00:00Z",
			updated_at: "2025-03-26T19:00:00Z",
			exercises: [],
		};
		const hevyClient: HevyClient = {
			createRoutine: vi
				.fn()
				.mockResolvedValue({ routine: [routine] } as unknown as Routine),
		} as unknown as HevyClient;

		registerRoutineTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "create-routine");

		const response = await handler({
			title: "Wrapped Response",
			folderId: null,
			exercises: [
				{
					exerciseTemplateId: "template-id",
					sets: [{ type: "normal", weightKg: 50, reps: 10 }],
				},
			],
		} as Record<string, unknown>);

		const parsed = JSON.parse(response.content[0].text) as unknown;
		expect(parsed).toEqual(formatRoutine(routine));
	});

	it("update-routine unwraps {routine: [...]} mutation response", async () => {
		// Regression test: PUT /v1/routines/:id has the same wrapping
		// behaviour as POST; unwrap so the response isn't "{}".
		const { server, tool } = createMockServer();
		const routine: Routine = {
			id: "updated-routine",
			title: "Wrapped Response",
			folder_id: null,
			created_at: "2025-03-26T19:00:00Z",
			updated_at: "2025-03-26T19:30:00Z",
			exercises: [],
		};
		const hevyClient: HevyClient = {
			updateRoutine: vi
				.fn()
				.mockResolvedValue({ routine: [routine] } as unknown as Routine),
		} as unknown as HevyClient;

		registerRoutineTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "update-routine");

		const response = await handler({
			routineId: "routine-123",
			title: "Wrapped Response",
			exercises: [
				{
					exerciseTemplateId: "template-id",
					sets: [{ type: "normal", weightKg: 50, reps: 10 }],
				},
			],
		} as Record<string, unknown>);

		const parsed = JSON.parse(response.content[0].text) as unknown;
		expect(parsed).toEqual(formatRoutine(routine));
	});

	it("create-routine omits rep_range from reps-only sets", async () => {
		// Regression test: the Hevy API rejects PUT payloads containing
		// `rep_range: null` with "rep_range must be of type object", and the
		// mobile app stores a null range object instead of treating the set
		// as reps-only. When no rep range is provided, the field must be
		// omitted from the outgoing payload.
		const { server, tool } = createMockServer();
		const routine: Routine = {
			id: "created-routine",
			title: "Reps Only",
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
			title: "Reps Only",
			folderId: null,
			exercises: [
				{
					exerciseTemplateId: "template-id",
					sets: [{ type: "normal", weightKg: 50, reps: 10 }],
				},
			],
		} as Record<string, unknown>);

		const call = vi.mocked(hevyClient.createRoutine).mock.calls[0]?.[0] as {
			routine: { exercises: Array<{ sets: Array<Record<string, unknown>> }> };
		};
		const set = call.routine.exercises[0]?.sets[0] as Record<string, unknown>;
		expect(set).not.toHaveProperty("rep_range");
		expect(set.reps).toBe(10);
	});

	it("update-routine omits rep_range from reps-only sets", async () => {
		// Regression test: `update-routine` previously always sent
		// `rep_range: repRange`, producing `rep_range: null` for reps-only
		// sets. The Hevy API rejects that payload ("rep_range must be of
		// type object"), so every update with at least one reps-only set
		// failed. The field must be omitted when no range exists.
		const { server, tool } = createMockServer();
		const routine: Routine = {
			id: "updated-routine",
			title: "Reps Only",
			folder_id: null,
			created_at: "2025-03-26T19:00:00Z",
			updated_at: "2025-03-26T19:30:00Z",
			exercises: [],
		};
		const hevyClient: HevyClient = {
			updateRoutine: vi.fn().mockResolvedValue(routine),
		} as unknown as HevyClient;

		registerRoutineTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "update-routine");

		await handler({
			routineId: "routine-123",
			title: "Reps Only",
			exercises: [
				{
					exerciseTemplateId: "template-id",
					sets: [
						{ type: "warmup", weightKg: 40, reps: 6 },
						{ type: "normal", weightKg: 60, reps: 10 },
					],
				},
			],
		} as Record<string, unknown>);

		const call = vi.mocked(hevyClient.updateRoutine).mock.calls[0]?.[1] as {
			routine: { exercises: Array<{ sets: Array<Record<string, unknown>> }> };
		};
		const sets = call.routine.exercises[0]?.sets ?? [];
		for (const set of sets) {
			expect(set).not.toHaveProperty("rep_range");
		}
	});

	it("update-routine preserves rep_range when a real range is provided", async () => {
		// Counterpart to the omit regression: when the caller supplies a
		// real rep range, it must round-trip into the payload as an object
		// so the Hevy API stores it.
		const { server, tool } = createMockServer();
		const routine: Routine = {
			id: "updated-routine",
			title: "With Range",
			folder_id: null,
			created_at: "2025-03-26T19:00:00Z",
			updated_at: "2025-03-26T19:30:00Z",
			exercises: [],
		};
		const hevyClient: HevyClient = {
			updateRoutine: vi.fn().mockResolvedValue(routine),
		} as unknown as HevyClient;

		registerRoutineTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "update-routine");

		await handler({
			routineId: "routine-123",
			title: "With Range",
			exercises: [
				{
					exerciseTemplateId: "template-id",
					sets: [
						{
							type: "normal",
							weightKg: 80,
							reps: null,
							repRange: { start: 8, end: 12 },
						},
					],
				},
			],
		} as Record<string, unknown>);

		const call = vi.mocked(hevyClient.updateRoutine).mock.calls[0]?.[1] as {
			routine: { exercises: Array<{ sets: Array<Record<string, unknown>> }> };
		};
		const set = call.routine.exercises[0]?.sets[0] as Record<string, unknown>;
		expect(set.rep_range).toEqual({ start: 8, end: 12 });
	});

	it("create-routine schema keeps reps null (does not coerce to 0)", () => {
		const { server, tool } = createMockServer();
		registerRoutineTools(server, null);
		const { schema } = getToolRegistration(tool, "create-routine");

		const zodSchema = z.object(schema);
		const parsed = zodSchema.parse({
			title: "Leg Day",
			folderId: null,
			exercises: [
				{
					exerciseTemplateId: "template-id",
					supersetId: null,
					restSeconds: 90,
					sets: [{ weightKg: 100, reps: null }],
				},
			],
		}) as { exercises: Array<{ sets: Array<{ reps?: number | null }> }> };

		expect(parsed.exercises[0]?.sets[0]?.reps).toBeNull();
	});

	it("update-routine keeps reps when repRange is provided", async () => {
		const { server, tool } = createMockServer();
		const routine: Routine = {
			id: "updated-routine",
			title: "Updated Routine",
			folder_id: null,
			created_at: "2025-03-26T19:00:00Z",
			updated_at: "2025-03-26T19:30:00Z",
			exercises: [],
		};
		const hevyClient: HevyClient = {
			updateRoutine: vi.fn().mockResolvedValue(routine),
		} as unknown as HevyClient;

		registerRoutineTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "update-routine");

		await handler({
			routineId: "routine-123",
			title: "Updated Routine",
			exercises: [
				{
					exerciseTemplateId: "template-id",
					supersetId: null,
					restSeconds: 90,
					sets: [
						{
							type: "normal" as const,
							weightKg: 100,
							reps: 10,
							repRange: { start: 8, end: 12 },
						},
					],
				},
			],
		} as Record<string, unknown>);

		expect(hevyClient.updateRoutine).toHaveBeenCalledWith(
			"routine-123",
			expect.objectContaining({
				routine: expect.objectContaining({
					exercises: [
						expect.objectContaining({
							sets: [
								expect.objectContaining({
									reps: 10,
									rep_range: { start: 8, end: 12 },
								}),
							],
						}),
					],
				}),
			}),
		);
	});

	it("update-routine copies reps from fixed repRange when reps is omitted", async () => {
		const { server, tool } = createMockServer();
		const routine: Routine = {
			id: "updated-routine",
			title: "Updated Routine",
			folder_id: null,
			created_at: "2025-03-26T19:00:00Z",
			updated_at: "2025-03-26T19:30:00Z",
			exercises: [],
		};
		const hevyClient: HevyClient = {
			updateRoutine: vi.fn().mockResolvedValue(routine),
		} as unknown as HevyClient;

		registerRoutineTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "update-routine");

		const response = await handler({
			routineId: "routine-123",
			title: "Updated Routine",
			exercises: [
				{
					exerciseTemplateId: "template-id",
					supersetId: null,
					restSeconds: 90,
					sets: [
						{
							type: "normal" as const,
							weightKg: 100,
							repRange: { start: 8, end: 8 },
						},
					],
				},
			],
		} as Record<string, unknown>);

		expect(hevyClient.updateRoutine).toHaveBeenCalledWith(
			"routine-123",
			expect.objectContaining({
				routine: expect.objectContaining({
					exercises: [
						expect.objectContaining({
							sets: [
								expect.objectContaining({
									reps: 8,
									rep_range: { start: 8, end: 8 },
								}),
							],
						}),
					],
				}),
			}),
		);

		expect(response.content).toHaveLength(1);
	});

	it("update-routine includes a rep range display warning when repRange is provided", async () => {
		const { server, tool } = createMockServer();
		const routine: Routine = {
			id: "updated-routine",
			title: "Updated Routine",
			folder_id: null,
			created_at: "2025-03-26T19:00:00Z",
			updated_at: "2025-03-26T19:30:00Z",
			exercises: [],
		};
		const hevyClient: HevyClient = {
			updateRoutine: vi.fn().mockResolvedValue(routine),
		} as unknown as HevyClient;

		registerRoutineTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "update-routine");

		const response = await handler({
			routineId: "routine-123",
			title: "Updated Routine",
			exercises: [
				{
					exerciseTemplateId: "template-id",
					supersetId: null,
					restSeconds: 90,
					sets: [
						{
							type: "normal" as const,
							weightKg: 100,
							repRange: { start: 8, end: 12 },
						},
					],
				},
			],
		} as Record<string, unknown>);

		expect(response.content).toHaveLength(2);
		expect(JSON.parse(response.content[0].text)).toEqual(
			formatRoutine(routine),
		);
		expect(response.content[1]?.text).toContain("rep ranges");
		expect(response.content[1]?.text).toContain("issues/261");
	});

	it("update-routine processes exercises array correctly", async () => {
		const { server, tool } = createMockServer();
		const routine: Routine = {
			id: "updated-routine",
			title: "Updated Routine",
			folder_id: null,
			created_at: "2025-03-26T19:00:00Z",
			updated_at: "2025-03-26T19:30:00Z",
			exercises: [],
		};
		const hevyClient: HevyClient = {
			updateRoutine: vi.fn().mockResolvedValue(routine),
		} as unknown as HevyClient;

		registerRoutineTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "update-routine");

		// Note: The preprocessing happens in the MCP SDK's validation layer,
		// not in the handler. When testing the handler directly, we pass the
		// already-processed (native array) value.
		const args = {
			routineId: "routine-123",
			title: "Updated Routine",
			notes: "Test notes",
			exercises: [
				{
					exerciseTemplateId: "template-id",
					supersetId: null,
					restSeconds: 90,
					notes: "Test notes",
					sets: [
						{
							type: "normal" as const,
							weightKg: 100,
							reps: 10,
						},
					],
				},
			],
		};

		await handler(args as Record<string, unknown>);

		// Verify that the handler correctly processed the exercises array
		expect(hevyClient.updateRoutine).toHaveBeenCalledWith("routine-123", {
			routine: {
				title: "Updated Routine",
				notes: "Test notes",
				exercises: [
					{
						exercise_template_id: "template-id",
						superset_id: null,
						rest_seconds: 90,
						notes: "Test notes",
						sets: [
							{
								type: "normal",
								weight_kg: 100,
								reps: 10,
								distance_meters: null,
								duration_seconds: null,
								custom_metric: null,
							},
						],
					},
				],
			},
		});
	});
});
