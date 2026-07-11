import nock from "nock";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { registerWorkoutPrompts } from "../../../../src/prompts/workouts.js";
import { registerHevyResources } from "../../../../src/resources/hevy.js";
import { registerTemplateTools } from "../../../../src/tools/templates.js";
import {
	createExerciseTemplateFixture,
	createExerciseTemplatesResponse,
	createRoutineFolderFixture,
	createRoutineFoldersResponse,
	createUserInfoFixture,
	createUserInfoResponse,
	createWorkoutCountResponse,
} from "../../../support/hevy-fixtures.js";
import {
	callTool,
	cleanupMockedMcpTestState,
	composeMockedComponentRegistration,
	createMockedApiScope,
	createMockedMcpHarness,
	disableMockedMcpExternalNetworking,
	parseToolText,
} from "../../../support/mocked-mcp.js";

const registerPromptSurface = composeMockedComponentRegistration((server) =>
	registerWorkoutPrompts(server),
);
const registerResourceSurface = composeMockedComponentRegistration(
	registerHevyResources,
);
const registerTemplateSurface = composeMockedComponentRegistration(
	registerTemplateTools,
	registerHevyResources,
);

function parseResource(
	result: Awaited<
		ReturnType<
			Awaited<
				ReturnType<typeof createMockedMcpHarness>
			>["client"]["readResource"]
		>
	>,
) {
	const content = result.contents[0];
	if (!content || !("text" in content)) {
		throw new Error("Expected JSON text resource content");
	}

	return {
		content,
		data: JSON.parse(content.text) as unknown,
	};
}

describe("MCP prompt and resource contracts", () => {
	let restoreExternalNetworking: (() => void) | undefined;

	beforeAll(() => {
		restoreExternalNetworking = disableMockedMcpExternalNetworking(() =>
			nock.enableNetConnect(),
		);
	});

	afterEach(async () => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		await cleanupMockedMcpTestState();
	});

	afterAll(() => {
		restoreExternalNetworking?.();
	});

	it("invokes analyze-workout-progress with default and boundary weeks", async () => {
		const harness = await createMockedMcpHarness({
			name: "prompt-analyze-contract",
			register: registerPromptSurface,
		});

		try {
			const defaultResult = await harness.client.getPrompt({
				name: "analyze-workout-progress",
				arguments: {},
			});
			const boundaryResult = await harness.client.getPrompt({
				name: "analyze-workout-progress",
				arguments: { weeks: "12" },
			});

			expect(defaultResult.messages).toEqual([
				{
					role: "user",
					content: {
						type: "text",
						text: expect.stringMatching(
							/^Analyze my workout progress over the last 4 weeks\.\n/,
						),
					},
				},
			]);
			expect(defaultResult.messages[0]?.content).toMatchObject({
				type: "text",
				text: expect.stringContaining(
					"Use get-workout-count to establish the available workout total.",
				),
			});
			expect(boundaryResult.messages).toEqual([
				{
					role: "user",
					content: {
						type: "text",
						text: expect.stringMatching(
							/^Analyze my workout progress over the last 12 weeks\.\n/,
						),
					},
				},
			]);
		} finally {
			await harness.close();
		}
	});

	it("invokes create-workout-from-routine with exact workflow content", async () => {
		const harness = await createMockedMcpHarness({
			name: "prompt-create-contract",
			register: registerPromptSurface,
		});

		try {
			const result = await harness.client.getPrompt({
				name: "create-workout-from-routine",
				arguments: {
					routineId: "routine-42",
					startTime: "2026-07-11T06:30:00Z",
				},
			});

			expect(result.messages).toEqual([
				{
					role: "user",
					content: {
						type: "text",
						text: [
							"Create a workout from routine routine-42, starting at 2026-07-11T06:30:00Z.",
							"First call get-routine with the routineId and map supported plan fields: routine title to workout title, plus each exerciseTemplateId, supersetId, exercise notes, and set type.",
							"Do not copy routine-only restSeconds or repRange fields into create-workout.",
							"Before calling create-workout, confirm or collect the user's actual completed set data for every set, including applicable weight, reps, distance, duration, RPE, or custom metric values.",
							"Also collect the required endTime in strict UTC YYYY-MM-DDTHH:mm:ssZ format and confirm any other missing required workout fields.",
							"Never invent completion data. If the actual results or endTime are unavailable, ask the user for them instead of creating the workout.",
							"Once confirmed, call create-workout with only fields supported by that tool.",
						].join("\n"),
					},
				},
			]);
		} finally {
			await harness.close();
		}
	});

	it.each([
		[
			"analyze-workout-progress",
			{ weeks: "0" },
			"Invalid arguments for prompt analyze-workout-progress",
		],
		[
			"create-workout-from-routine",
			{ routineId: "routine-42" },
			"Invalid arguments for prompt create-workout-from-routine",
		],
		[
			"create-workout-from-routine",
			{ routineId: "", startTime: "2026-07-11 06:30:00" },
			"Invalid arguments for prompt create-workout-from-routine",
		],
	] as const)(
		"rejects invalid invocation for %s without HTTP",
		async (name, arguments_, expectedMessage) => {
			const harness = await createMockedMcpHarness({
				name: `prompt-invalid-${name}`,
				register: registerPromptSurface,
			});

			try {
				await expect(
					harness.client.getPrompt({ name, arguments: arguments_ }),
				).rejects.toThrow(expectedMessage);
			} finally {
				await harness.close();
			}
		},
	);

	it("reads all four canonical JSON resources with exact URI and MIME", async () => {
		const harness = await createMockedMcpHarness({
			name: "resource-success-contract",
			register: registerResourceSurface,
		});
		createMockedApiScope()
			.get("/v1/user/info")
			.reply(
				200,
				createUserInfoResponse(
					createUserInfoFixture({
						id: "contract-user",
						name: "Contract User",
						url: "https://hevy.com/user/contract-user",
					}),
				),
			);
		createMockedApiScope()
			.get("/v1/workouts/count")
			.reply(200, createWorkoutCountResponse(17));
		createMockedApiScope()
			.get("/v1/exercise_templates")
			.query({ page: 1, pageSize: 100 })
			.reply(
				200,
				createExerciseTemplatesResponse([
					createExerciseTemplateFixture({
						id: "contract-template",
						title: "Contract Press",
					}),
				]),
			);
		createMockedApiScope()
			.get("/v1/routine_folders")
			.query({ page: 1, pageSize: 10 })
			.reply(
				200,
				createRoutineFoldersResponse([
					createRoutineFolderFixture({ id: 31, title: "Contract Folder" }),
				]),
			);

		try {
			const [user, count, templates, folders] = await Promise.all([
				harness.client.readResource({ uri: "hevy://user" }),
				harness.client.readResource({ uri: "hevy://workout-count" }),
				harness.client.readResource({ uri: "hevy://exercise-templates" }),
				harness.client.readResource({ uri: "hevy://routine-folders" }),
			]);
			const parsed = [user, count, templates, folders].map(parseResource);

			expect(parsed.map(({ content }) => content)).toEqual([
				expect.objectContaining({
					uri: "hevy://user",
					mimeType: "application/json",
				}),
				expect.objectContaining({
					uri: "hevy://workout-count",
					mimeType: "application/json",
				}),
				expect.objectContaining({
					uri: "hevy://exercise-templates",
					mimeType: "application/json",
				}),
				expect.objectContaining({
					uri: "hevy://routine-folders",
					mimeType: "application/json",
				}),
			]);
			expect(parsed.map(({ data }) => data)).toEqual([
				{
					id: "contract-user",
					name: "Contract User",
					url: "https://hevy.com/user/contract-user",
				},
				{ count: 17 },
				[
					{
						id: "contract-template",
						title: "Contract Press",
						type: "weight_reps",
						primaryMuscleGroup: "chest",
						secondaryMuscleGroups: ["triceps"],
						isCustom: false,
					},
				],
				[expect.objectContaining({ id: 31, title: "Contract Folder" })],
			]);
		} finally {
			await harness.close();
		}
	});

	it("maps semantically empty upstream resource data deterministically", async () => {
		const harness = await createMockedMcpHarness({
			name: "resource-empty-contract",
			register: registerResourceSurface,
		});
		createMockedApiScope().get("/v1/user/info").reply(200, {});
		createMockedApiScope().get("/v1/workouts/count").reply(200, {});
		createMockedApiScope()
			.get("/v1/exercise_templates")
			.query({ page: 1, pageSize: 100 })
			.reply(200, { page: 1, page_count: 1, exercise_templates: [] });
		createMockedApiScope()
			.get("/v1/routine_folders")
			.query({ page: 1, pageSize: 10 })
			.reply(200, { page: 1, page_count: 1, routine_folders: [] });

		try {
			const results = await Promise.all(
				[
					"hevy://user",
					"hevy://workout-count",
					"hevy://exercise-templates",
					"hevy://routine-folders",
				].map((uri) => harness.client.readResource({ uri })),
			);
			expect(results.map((result) => parseResource(result).data)).toEqual([
				null,
				{ count: 0 },
				[],
				[],
			]);
		} finally {
			await harness.close();
		}
	});

	it("does not retry a non-retryable resource error", async () => {
		const harness = await createMockedMcpHarness({
			name: "resource-non-retry-error-contract",
			register: registerResourceSurface,
		});
		const scope = createMockedApiScope()
			.get("/v1/user/info")
			.reply(400, { error: "bad request" });

		try {
			await expect(
				harness.client.readResource({ uri: "hevy://user" }),
			).rejects.toThrow();
			expect(scope.isDone()).toBe(true);
		} finally {
			await harness.close();
		}
	});

	it("retries a transient GET resource failure three times before rejecting", async () => {
		const harness = await createMockedMcpHarness({
			name: "resource-retry-error-contract",
			register: registerResourceSurface,
		});
		const scope = createMockedApiScope()
			.get("/v1/workouts/count")
			.times(4)
			.reply(503, { error: "unavailable" });
		const nativeSetTimeout = globalThis.setTimeout;
		const retryDelays: number[] = [];
		vi.spyOn(globalThis, "setTimeout").mockImplementation(
			(callback: Parameters<typeof setTimeout>[0], delay?: number, ...args) => {
				const delayMs = Number(delay ?? 0);
				if (delayMs <= 1_200) {
					retryDelays.push(delayMs);
					if (typeof callback === "function") callback(...args);
					return 0 as unknown as ReturnType<typeof setTimeout>;
				}
				return nativeSetTimeout(callback, delay, ...args);
			},
		);

		try {
			await expect(
				harness.client.readResource({ uri: "hevy://workout-count" }),
			).rejects.toThrow();
			expect(scope.isDone()).toBe(true);
			expect(retryDelays).toEqual([300, 600, 1_200]);
		} finally {
			await harness.close();
		}
	});

	it("coalesces concurrent tool/resource catalog loads and reuses cached state", async () => {
		const harness = await createMockedMcpHarness({
			name: "shared-template-cache-contract",
			register: registerTemplateSurface,
		});
		const firstScope = createMockedApiScope()
			.get("/v1/exercise_templates")
			.query({ page: 1, pageSize: 100 })
			.once()
			.reply(
				200,
				createExerciseTemplatesResponse([
					createExerciseTemplateFixture({
						id: "shared-template",
						title: "Shared Bench Press",
					}),
				]),
			);

		try {
			const [toolResult, resourceResult] = await Promise.all([
				callTool(harness.client, "search-exercise-templates", {
					query: "bench",
				}),
				harness.client.readResource({ uri: "hevy://exercise-templates" }),
			]);
			expect(firstScope.isDone()).toBe(true);
			expect(parseToolText(toolResult)).toEqual(
				parseResource(resourceResult).data,
			);

			const [cachedTool, cachedResource] = await Promise.all([
				callTool(harness.client, "search-exercise-templates", {
					query: "shared",
				}),
				harness.client.readResource({ uri: "hevy://exercise-templates" }),
			]);
			expect(parseToolText(cachedTool)).toEqual(
				parseResource(cachedResource).data,
			);
		} finally {
			await harness.close();
		}

		const resetHarness = await createMockedMcpHarness({
			name: "shared-template-cache-reset-contract",
			register: registerTemplateSurface,
		});
		const resetScope = createMockedApiScope()
			.get("/v1/exercise_templates")
			.query({ page: 1, pageSize: 100 })
			.once()
			.reply(200, createExerciseTemplatesResponse([]));

		try {
			const result = await resetHarness.client.readResource({
				uri: "hevy://exercise-templates",
			});
			expect(parseResource(result).data).toEqual([]);
			expect(resetScope.isDone()).toBe(true);
		} finally {
			await resetHarness.close();
		}
	});
});
