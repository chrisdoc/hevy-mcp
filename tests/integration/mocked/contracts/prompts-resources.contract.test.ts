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

const expectedDefaultAnalyzePrompt = [
	"Analyze my workout progress over the last 4 weeks.",
	"Use get-workout-count to establish the available workout total.",
	"Then call get-workouts with pageSize=10 and continue through pages until the requested date window is fully covered or no more workouts remain.",
	"Also call get-body-measurements with pageSize=10 and paginate until the same date window is covered or no more measurements remain.",
	"Base the analysis on retrieved evidence and discuss workout frequency, training volume, exercise variety, consistency, and body-measurement trends.",
	"Distinguish observations from suggestions, note missing or limited data, and do not make unsupported claims or medical conclusions.",
].join("\n");

const expectedBoundaryAnalyzePrompt = [
	"Analyze my workout progress over the last 12 weeks.",
	"Use get-workout-count to establish the available workout total.",
	"Then call get-workouts with pageSize=10 and continue through pages until the requested date window is fully covered or no more workouts remain.",
	"Also call get-body-measurements with pageSize=10 and paginate until the same date window is covered or no more measurements remain.",
	"Base the analysis on retrieved evidence and discuss workout frequency, training volume, exercise variety, consistency, and body-measurement trends.",
	"Distinguish observations from suggestions, note missing or limited data, and do not make unsupported claims or medical conclusions.",
].join("\n");

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

async function cleanupFreshCatalogTestState(
	close: () => Promise<void>,
	resetCatalog: () => void,
) {
	let closeFailed = false;
	let closeError: unknown;
	let resetFailed = false;
	let resetError: unknown;

	try {
		await close();
	} catch (error) {
		closeFailed = true;
		closeError = error;
	} finally {
		try {
			resetCatalog();
		} catch (error) {
			resetFailed = true;
			resetError = error;
		} finally {
			vi.useRealTimers();
		}
	}

	if (closeFailed) throw closeError;
	if (resetFailed) throw resetError;
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
						text: expectedDefaultAnalyzePrompt,
					},
				},
			]);
			expect(boundaryResult.messages).toEqual([
				{
					role: "user",
					content: {
						type: "text",
						text: expectedBoundaryAnalyzePrompt,
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
					createRoutineFolderFixture({
						id: 31,
						title: "Contract Folder",
						created_at: "2026-07-10T08:15:00Z",
						updated_at: "2026-07-11T06:45:00Z",
					}),
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
				[
					{
						id: 31,
						title: "Contract Folder",
						createdAt: "2026-07-10T08:15:00Z",
						updatedAt: "2026-07-11T06:45:00Z",
					},
				],
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
		let requestCount = 0;
		let retryCount = 0;
		const initialScope = createMockedApiScope()
			.get("/v1/user/info")
			.once()
			.reply(() => {
				requestCount++;
				return [400, { error: "bad request" }];
			});
		createMockedApiScope()
			.get("/v1/user/info")
			.optionally()
			.reply(() => {
				retryCount++;
				return [500, { error: "unexpected retry" }];
			});

		try {
			await expect(
				harness.client.readResource({ uri: "hevy://user" }),
			).rejects.toThrow();
			expect(initialScope.isDone()).toBe(true);
			expect(requestCount).toBe(1);
			expect(retryCount).toBe(0);
		} finally {
			await harness.close();
		}
	});

	it("refreshes the shared template catalog exactly at its five-minute TTL", async () => {
		const initialTime = Date.UTC(2026, 6, 11, 7, 0, 0);
		let harness: Awaited<ReturnType<typeof createMockedMcpHarness>> | undefined;
		let resetCatalog = () => {};

		try {
			vi.useFakeTimers({ toFake: ["Date"] });
			vi.setSystemTime(initialTime);
			vi.resetModules();

			const [templatesModule, resourcesModule, catalogModule] =
				await Promise.all([
					import("../../../../src/tools/templates.js"),
					import("../../../../src/resources/hevy.js"),
					import("../../../../src/utils/exercise-template-catalog.js"),
				]);
			resetCatalog = catalogModule.resetExerciseTemplateCatalogCache;
			const registerTtlSurface = composeMockedComponentRegistration(
				templatesModule.registerTemplateTools,
				resourcesModule.registerHevyResources,
			);
			harness = await createMockedMcpHarness({
				name: "shared-template-cache-ttl-contract",
				register: registerTtlSurface,
			});
			let initialRequests = 0;
			let refreshRequests = 0;
			const initialTemplate = createExerciseTemplateFixture({
				id: "ttl-initial-template",
				title: "Initial TTL Press",
			});
			const refreshedTemplate = createExerciseTemplateFixture({
				id: "ttl-refreshed-template",
				title: "Refetched TTL Press",
			});
			const initialScope = createMockedApiScope()
				.get("/v1/exercise_templates")
				.query({ page: 1, pageSize: 100 })
				.once()
				.reply(() => {
					initialRequests++;
					return [200, createExerciseTemplatesResponse([initialTemplate])];
				});
			const refreshScope = createMockedApiScope()
				.get("/v1/exercise_templates")
				.query({ page: 1, pageSize: 100 })
				.once()
				.reply(() => {
					refreshRequests++;
					return [200, createExerciseTemplatesResponse([refreshedTemplate])];
				});

			const initialResult = await harness.client.readResource({
				uri: "hevy://exercise-templates",
			});
			expect(parseResource(initialResult).data).toEqual([
				{
					id: "ttl-initial-template",
					title: "Initial TTL Press",
					type: "weight_reps",
					primaryMuscleGroup: "chest",
					secondaryMuscleGroups: ["triceps"],
					isCustom: false,
				},
			]);
			expect(initialScope.isDone()).toBe(true);
			expect(initialRequests).toBe(1);

			vi.setSystemTime(initialTime + 299_999);
			const cachedResult = await harness.client.readResource({
				uri: "hevy://exercise-templates",
			});
			expect(parseResource(cachedResult).data).toEqual(
				parseResource(initialResult).data,
			);
			expect(refreshRequests).toBe(0);

			vi.setSystemTime(initialTime + 300_000);
			const refreshedResult = await harness.client.readResource({
				uri: "hevy://exercise-templates",
			});
			expect(refreshScope.isDone()).toBe(true);
			expect(refreshRequests).toBe(1);
			expect(parseResource(refreshedResult).data).toEqual([
				{
					id: "ttl-refreshed-template",
					title: "Refetched TTL Press",
					type: "weight_reps",
					primaryMuscleGroup: "chest",
					secondaryMuscleGroups: ["triceps"],
					isCustom: false,
				},
			]);
		} finally {
			await cleanupFreshCatalogTestState(
				async () => harness?.close(),
				resetCatalog,
			);
		}
	});

	it("restores fresh catalog state when harness cleanup rejects", async () => {
		const closeError = new Error("harness close failed");
		const close = vi.fn(async () => {
			throw closeError;
		});
		const resetCatalog = vi.fn();

		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(Date.UTC(2026, 6, 11, 7, 0, 0));
		expect(vi.isFakeTimers()).toBe(true);

		await expect(
			cleanupFreshCatalogTestState(close, resetCatalog),
		).rejects.toBe(closeError);
		expect(close).toHaveBeenCalledOnce();
		expect(resetCatalog).toHaveBeenCalledOnce();
		expect(vi.isFakeTimers()).toBe(false);
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
