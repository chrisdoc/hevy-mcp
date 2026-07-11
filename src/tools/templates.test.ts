import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExerciseTemplate } from "../generated/client/types/index.js";
import { formatExerciseTemplate } from "../utils/formatters.js";
import type { HevyClient } from "../utils/hevyClient.js";
import { registerTemplateTools } from "./templates.js";

function createMockServer(
	options: {
		capabilities?: unknown;
		result?: {
			action: "accept" | "decline" | "cancel";
			content?: { confirm: boolean };
		};
	} = {},
) {
	const tool = vi.fn();
	const capabilities = Object.hasOwn(options, "capabilities")
		? options.capabilities
		: { elicitation: { form: {} } };
	const elicitInput = vi
		.fn()
		.mockResolvedValue(
			options.result ?? { action: "accept", content: { confirm: true } },
		);
	const server = {
		tool,
		registerTool: tool,
		server: {
			getClientCapabilities: vi.fn(() => capabilities),
			elicitInput,
		},
	} as unknown as McpServer;
	return { elicitInput, server, tool };
}

function getToolRegistration(toolSpy: ReturnType<typeof vi.fn>, name: string) {
	const match = toolSpy.mock.calls.find(([toolName]) => toolName === name);
	if (!match) {
		throw new Error(`Tool ${name} was not registered`);
	}
	const handler = match.at(-1) as (args: Record<string, unknown>) => Promise<{
		content: Array<{ type: string; text: string }>;
		isError?: boolean;
		structuredContent?: Record<string, unknown>;
	}>;
	const config = match[1] as { outputSchema?: unknown } | undefined;
	return { outputSchema: config?.outputSchema, handler };
}

describe("registerTemplateTools", () => {
	it("returns error responses when Hevy client is not initialized", async () => {
		const { server, tool } = createMockServer();
		registerTemplateTools(server, null);

		const toolNames = [
			"get-exercise-templates",
			"get-exercise-template",
			"get-exercise-history",
			"create-exercise-template",
			"search-exercise-templates",
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

	it("get-exercise-templates returns formatted templates from the client", async () => {
		const { server, tool } = createMockServer();
		const template: ExerciseTemplate = {
			id: "t1",
			title: "Bench Press",
			type: "barbell",
			primary_muscle_group: "chest",
			secondary_muscle_groups: ["triceps"],
			is_custom: false,
		};
		const hevyClient: HevyClient = {
			getExerciseTemplates: vi
				.fn()
				.mockResolvedValue({ exercise_templates: [template] }),
		} as unknown as HevyClient;

		registerTemplateTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-exercise-templates");

		const response = await handler({ page: 1, pageSize: 5 });

		expect(hevyClient.getExerciseTemplates).toHaveBeenCalledWith({
			page: 1,
			pageSize: 5,
		});

		const parsed = JSON.parse(response.content[0].text) as unknown[];
		expect(parsed).toEqual([formatExerciseTemplate(template)]);
		expect(response.structuredContent).toEqual({ exerciseTemplates: parsed });
	});

	it("get-exercise-template returns an empty response when template is not found", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			getExerciseTemplate: vi.fn().mockResolvedValue(null),
		} as unknown as HevyClient;

		registerTemplateTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-exercise-template");

		const response = await handler({ exerciseTemplateId: "missing-id" });
		expect(hevyClient.getExerciseTemplate).toHaveBeenCalledWith("missing-id");
		expect(response.content[0]?.text).toBe(
			"Exercise template with ID missing-id not found",
		);
		expect(response.structuredContent).toEqual({ exerciseTemplate: null });
	});

	it("get-exercise-template returns structured template details", async () => {
		const { server, tool } = createMockServer();
		const template: ExerciseTemplate = {
			id: "t1",
			title: "Bench Press",
			type: "weight_reps",
			primary_muscle_group: "chest",
			secondary_muscle_groups: ["triceps"],
			is_custom: false,
		};
		const hevyClient = {
			getExerciseTemplate: vi.fn().mockResolvedValue(template),
		} as unknown as HevyClient;
		registerTemplateTools(server, hevyClient);

		const response = await getToolRegistration(
			tool,
			"get-exercise-template",
		).handler({ exerciseTemplateId: "t1" });
		const parsed = JSON.parse(response.content[0].text) as unknown;

		expect(response.structuredContent).toEqual({ exerciseTemplate: parsed });
	});

	it("get-exercise-history returns formatted entries", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			getExerciseHistory: vi.fn().mockResolvedValue({
				exercise_history: [
					{
						workout_id: "w1",
						workout_title: "Push Day",
						workout_start_time: "2024-01-01T10:00:00Z",
						workout_end_time: "2024-01-01T11:00:00Z",
						exercise_template_id: "t1",
						weight_kg: 80,
						reps: 8,
						distance_meters: null,
						duration_seconds: null,
						rpe: 8,
						custom_metric: null,
						set_type: "normal",
					},
				],
			}),
		} as unknown as HevyClient;

		registerTemplateTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-exercise-history");

		const response = await handler({
			exerciseTemplateId: "t1",
			startDate: "2024-01-01T00:00:00Z",
			endDate: "2024-02-01T00:00:00Z",
		});

		expect(hevyClient.getExerciseHistory).toHaveBeenCalledWith("t1", {
			start_date: "2024-01-01T00:00:00Z",
			end_date: "2024-02-01T00:00:00Z",
		});

		const parsed = JSON.parse(response.content[0].text) as unknown[];
		expect(parsed).toEqual([
			{
				workoutId: "w1",
				workoutTitle: "Push Day",
				workoutStartTime: "2024-01-01T10:00:00Z",
				workoutEndTime: "2024-01-01T11:00:00Z",
				exerciseTemplateId: "t1",
				weight: 80,
				reps: 8,
				distance: null,
				duration: null,
				rpe: 8,
				customMetric: null,
				setType: "normal",
			},
		]);
		expect(response.structuredContent).toEqual({ exerciseHistory: parsed });
	});

	it("returns structured empty lists for template list and history", async () => {
		const { server, tool } = createMockServer();
		const hevyClient = {
			getExerciseTemplates: vi
				.fn()
				.mockResolvedValue({ exercise_templates: [] }),
			getExerciseHistory: vi.fn().mockResolvedValue({ exercise_history: [] }),
		} as unknown as HevyClient;
		registerTemplateTools(server, hevyClient);

		const templates = await getToolRegistration(
			tool,
			"get-exercise-templates",
		).handler({ page: 1, pageSize: 5 });
		const history = await getToolRegistration(
			tool,
			"get-exercise-history",
		).handler({ exerciseTemplateId: "t1" });

		expect(templates.structuredContent).toEqual({ exerciseTemplates: [] });
		expect(history.structuredContent).toEqual({ exerciseHistory: [] });
	});

	describe("search-exercise-templates", () => {
		beforeEach(() => {});

		it("returns error when client is not initialized", async () => {
			const { server, tool } = createMockServer();
			registerTemplateTools(server, null);
			const { handler } = getToolRegistration(
				tool,
				"search-exercise-templates",
			);
			const response = await handler({ query: "bench", refresh: false });
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
		});

		it("fetches all pages and filters by query substring", async () => {
			const { server, tool } = createMockServer();
			const benchTemplate: ExerciseTemplate = {
				id: "t1",
				title: "Bench Press",
				type: "barbell",
				primary_muscle_group: "chest",
				secondary_muscle_groups: ["triceps"],
				is_custom: false,
			};
			const squatTemplate: ExerciseTemplate = {
				id: "t2",
				title: "Back Squat",
				type: "barbell",
				primary_muscle_group: "quadriceps",
				secondary_muscle_groups: ["glutes"],
				is_custom: false,
			};

			const hevyClient: HevyClient = {
				getExerciseTemplates: vi
					.fn()
					.mockResolvedValueOnce({
						page: 1,
						page_count: 2,
						exercise_templates: [benchTemplate],
					})
					.mockResolvedValueOnce({
						page: 2,
						page_count: 2,
						exercise_templates: [squatTemplate],
					}),
			} as unknown as HevyClient;

			registerTemplateTools(server, hevyClient);
			const { handler } = getToolRegistration(
				tool,
				"search-exercise-templates",
			);

			const response = await handler({ query: "bench", refresh: false });

			expect(hevyClient.getExerciseTemplates).toHaveBeenCalledTimes(2);
			expect(hevyClient.getExerciseTemplates).toHaveBeenNthCalledWith(1, {
				page: 1,
				pageSize: 100,
			});
			expect(hevyClient.getExerciseTemplates).toHaveBeenNthCalledWith(2, {
				page: 2,
				pageSize: 100,
			});

			const parsed = JSON.parse(response.content[0].text) as unknown[];
			expect(parsed).toEqual([formatExerciseTemplate(benchTemplate)]);
		});

		it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, 0])(
			"stops safely when page_count is malformed (%s)",
			async (pageCount) => {
				const { server, tool } = createMockServer();
				const template: ExerciseTemplate = {
					id: "t1",
					title: "Bench Press",
					type: "barbell",
					primary_muscle_group: "chest",
					secondary_muscle_groups: [],
					is_custom: false,
				};
				const hevyClient: HevyClient = {
					getExerciseTemplates: vi.fn().mockResolvedValue({
						page: 1,
						page_count: pageCount,
						exercise_templates: [template],
					}),
				} as unknown as HevyClient;

				registerTemplateTools(server, hevyClient);
				const { handler } = getToolRegistration(
					tool,
					"search-exercise-templates",
				);

				const response = await handler({
					query: "bench",
					refresh: false,
				});

				expect(hevyClient.getExerciseTemplates).toHaveBeenCalledTimes(1);
				expect(JSON.parse(response.content[0].text)).toEqual([
					formatExerciseTemplate(template),
				]);
			},
		);

		it("uses cached data on subsequent calls without refresh", async () => {
			const { server, tool } = createMockServer();
			const template: ExerciseTemplate = {
				id: "t1",
				title: "Bench Press",
				type: "barbell",
				primary_muscle_group: "chest",
				secondary_muscle_groups: [],
				is_custom: false,
			};

			const hevyClient: HevyClient = {
				getExerciseTemplates: vi.fn().mockResolvedValue({
					page: 1,
					page_count: 1,
					exercise_templates: [template],
				}),
			} as unknown as HevyClient;

			registerTemplateTools(server, hevyClient);
			const { handler } = getToolRegistration(
				tool,
				"search-exercise-templates",
			);

			await handler({ query: "bench", refresh: false });
			await handler({ query: "bench", refresh: false });

			// API should only be called once — second call uses cache
			expect(hevyClient.getExerciseTemplates).toHaveBeenCalledTimes(1);
		});

		it("retries on next call after an initial fetch failure", async () => {
			const { server, tool } = createMockServer();
			const template: ExerciseTemplate = {
				id: "t1",
				title: "Bench Press",
				type: "barbell",
				primary_muscle_group: "chest",
				secondary_muscle_groups: [],
				is_custom: false,
			};

			const hevyClient: HevyClient = {
				getExerciseTemplates: vi
					.fn()
					.mockRejectedValueOnce(new Error("catalog fetch failed"))
					.mockResolvedValueOnce({
						page: 1,
						page_count: 1,
						exercise_templates: [template],
					}),
			} as unknown as HevyClient;

			registerTemplateTools(server, hevyClient);
			const { handler } = getToolRegistration(
				tool,
				"search-exercise-templates",
			);

			const failedResponse = await handler({
				query: "bench",
				refresh: false,
			});
			expect(failedResponse).toMatchObject({ isError: true });

			const successfulResponse = await handler({
				query: "bench",
				refresh: false,
			});

			expect(hevyClient.getExerciseTemplates).toHaveBeenCalledTimes(2);
			const parsed = JSON.parse(
				successfulResponse.content[0].text,
			) as unknown[];
			expect(parsed).toEqual([formatExerciseTemplate(template)]);
		});

		it("re-fetches when refresh is true", async () => {
			const { server, tool } = createMockServer();
			const template: ExerciseTemplate = {
				id: "t1",
				title: "Deadlift",
				type: "barbell",
				primary_muscle_group: "hamstrings",
				secondary_muscle_groups: [],
				is_custom: false,
			};

			const hevyClient: HevyClient = {
				getExerciseTemplates: vi.fn().mockResolvedValue({
					page: 1,
					page_count: 1,
					exercise_templates: [template],
				}),
			} as unknown as HevyClient;

			registerTemplateTools(server, hevyClient);
			const { handler } = getToolRegistration(
				tool,
				"search-exercise-templates",
			);

			await handler({ query: "dead", refresh: false });
			await handler({ query: "dead", refresh: true });

			// API should be called twice — refresh busts the cache
			expect(hevyClient.getExerciseTemplates).toHaveBeenCalledTimes(2);
		});

		it("logs successful initial and explicit refreshes but stays silent on cache hits", async () => {
			const { server, tool } = createMockServer();
			const logger = vi.fn();
			const template: ExerciseTemplate = {
				id: "t1",
				title: "Bench Press",
				type: "barbell",
				primary_muscle_group: "chest",
				secondary_muscle_groups: [],
				is_custom: false,
			};
			const hevyClient: HevyClient = {
				getExerciseTemplates: vi.fn().mockResolvedValue({
					page: 1,
					page_count: 1,
					exercise_templates: [template],
				}),
			} as unknown as HevyClient;

			registerTemplateTools(server, hevyClient, { logger });
			const { handler } = getToolRegistration(
				tool,
				"search-exercise-templates",
			);

			await handler({ query: "bench", refresh: false });
			expect(logger).toHaveBeenCalledExactlyOnceWith({
				level: "info",
				logger: "hevy-cache",
				data: {
					message: "Exercise template catalog refreshed",
					count: 1,
					reason: "initial-load",
				},
			});

			await handler({ query: "bench", refresh: false });
			expect(logger).toHaveBeenCalledTimes(1);

			await handler({ query: "bench", refresh: true });
			expect(logger).toHaveBeenNthCalledWith(2, {
				level: "info",
				logger: "hevy-cache",
				data: {
					message: "Exercise template catalog refreshed",
					count: 1,
					reason: "explicit-refresh",
				},
			});
		});

		it("sanitizes failures from the optional refresh logger", async () => {
			const { server, tool } = createMockServer();
			const secret = "sentinel-refresh-logger";
			const stderrSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => undefined);
			const hevyClient: HevyClient = {
				getExerciseTemplates: vi.fn().mockResolvedValue({
					page: 1,
					page_count: 1,
					exercise_templates: [],
				}),
			} as unknown as HevyClient;

			registerTemplateTools(server, hevyClient, {
				logger: () => {
					throw new Error(secret);
				},
			});
			const { handler } = getToolRegistration(
				tool,
				"search-exercise-templates",
			);

			await expect(
				handler({ query: "bench", refresh: false }),
			).resolves.toMatchObject({
				structuredContent: { exerciseTemplates: [] },
			});
			expect(stderrSpy).toHaveBeenCalledWith(
				"Failed to emit structured exercise template cache log",
				expect.objectContaining({ category: "Error" }),
			);
			expect(JSON.stringify(stderrSpy.mock.calls)).not.toContain(secret);
			stderrSpy.mockRestore();
		});

		it("does not log a cache refresh when the catalog fetch fails", async () => {
			const { server, tool } = createMockServer();
			const logger = vi.fn();
			const hevyClient: HevyClient = {
				getExerciseTemplates: vi
					.fn()
					.mockRejectedValue(new Error("catalog fetch failed")),
			} as unknown as HevyClient;

			registerTemplateTools(server, hevyClient, { logger });
			const { handler } = getToolRegistration(
				tool,
				"search-exercise-templates",
			);

			const response = await handler({ query: "bench", refresh: false });

			expect(response).toMatchObject({ isError: true });
			expect(logger).not.toHaveBeenCalled();
		});

		it("filters by primaryMuscleGroup when provided", async () => {
			const { server, tool } = createMockServer();
			const chestTemplate: ExerciseTemplate = {
				id: "t1",
				title: "Bench Press",
				type: "barbell",
				primary_muscle_group: "chest",
				secondary_muscle_groups: [],
				is_custom: false,
			};
			const shoulderTemplate: ExerciseTemplate = {
				id: "t2",
				title: "Bench Press (Incline)",
				type: "barbell",
				primary_muscle_group: "shoulders",
				secondary_muscle_groups: [],
				is_custom: false,
			};

			const hevyClient: HevyClient = {
				getExerciseTemplates: vi.fn().mockResolvedValue({
					page: 1,
					page_count: 1,
					exercise_templates: [chestTemplate, shoulderTemplate],
				}),
			} as unknown as HevyClient;

			registerTemplateTools(server, hevyClient);
			const { handler } = getToolRegistration(
				tool,
				"search-exercise-templates",
			);

			const response = await handler({
				query: "bench",
				primaryMuscleGroup: "chest",
				refresh: false,
			});

			const parsed = JSON.parse(response.content[0].text) as unknown[];
			expect(parsed).toEqual([formatExerciseTemplate(chestTemplate)]);
			expect(response.structuredContent).toEqual({ exerciseTemplates: parsed });
		});

		it("returns empty response when no templates match", async () => {
			const { server, tool } = createMockServer();
			const template: ExerciseTemplate = {
				id: "t1",
				title: "Squat",
				type: "barbell",
				primary_muscle_group: "quadriceps",
				secondary_muscle_groups: [],
				is_custom: false,
			};

			const hevyClient: HevyClient = {
				getExerciseTemplates: vi.fn().mockResolvedValue({
					page: 1,
					page_count: 1,
					exercise_templates: [template],
				}),
			} as unknown as HevyClient;

			registerTemplateTools(server, hevyClient);
			const { handler } = getToolRegistration(
				tool,
				"search-exercise-templates",
			);

			const response = await handler({ query: "bench", refresh: false });
			expect(response.content[0]?.text).toContain(
				'No exercise templates found matching "bench"',
			);
			expect(response.structuredContent).toEqual({ exerciseTemplates: [] });
		});
	});

	it("create-exercise-template maps input to API payload", async () => {
		const { server, tool } = createMockServer({ capabilities: {} });
		const hevyClient: HevyClient = {
			createExerciseTemplate: vi.fn().mockResolvedValue({ id: 42 }),
		} as unknown as HevyClient;

		registerTemplateTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "create-exercise-template");

		const response = await handler({
			title: "Custom Curl",
			exerciseType: "weight_reps",
			equipmentCategory: "dumbbell",
			muscleGroup: "biceps",
			otherMuscles: ["forearms"],
		});

		expect(hevyClient.createExerciseTemplate).toHaveBeenCalledWith({
			exercise: {
				title: "Custom Curl",
				exercise_type: "weight_reps",
				equipment_category: "dumbbell",
				muscle_group: "biceps",
				other_muscles: ["forearms"],
			},
		});

		const parsed = JSON.parse(response.content[0].text) as {
			id: number | undefined;
			message: string;
		};
		expect(parsed).toEqual({
			id: 42,
			message: "Exercise template created successfully",
		});
	});

	it.each([
		["declined", { result: { action: "decline" as const } }],
		["canceled", { result: { action: "cancel" as const } }],
		["unsupported", { capabilities: {} }],
	])(
		"does not create an exercise template when confirmation is %s",
		async (_label, confirmation) => {
			const { server, tool } = createMockServer(confirmation);
			const createExerciseTemplate = vi.fn();
			const hevyClient = { createExerciseTemplate } as unknown as HevyClient;
			registerTemplateTools(server, hevyClient, { confirmMutations: true });

			await getToolRegistration(tool, "create-exercise-template").handler({
				title: "Guarded Curl",
				exerciseType: "weight_reps",
				equipmentCategory: "dumbbell",
				muscleGroup: "biceps",
				otherMuscles: [],
			});

			expect(createExerciseTemplate).not.toHaveBeenCalled();
		},
	);
});
