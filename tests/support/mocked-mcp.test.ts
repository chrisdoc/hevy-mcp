import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
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
import { registerTemplateTools } from "../../src/tools/templates.js";
import {
	createExerciseTemplateFixture,
	createExerciseTemplatesResponse,
	createRoutineFixture,
	createRoutinesResponse,
} from "./hevy-fixtures.js";
import {
	callTool,
	cleanupMockedMcpTestState,
	composeMockedComponentRegistration,
	createMockedApiScope,
	createMockedHevyClient,
	createMockedMcpHarness,
	disableMockedMcpExternalNetworking,
	getToolText,
	MOCK_HEVY_API_BASE_URL,
	parseToolText,
	requireStructuredContent,
	teardownMockedMcpTestState,
} from "./mocked-mcp.js";

async function requestText(
	url: string,
	headers: Record<string, string> = {},
): Promise<string> {
	const response = await fetch(url, { headers });
	return response.text();
}

async function withLocalHttpServer(
	run: (url: string) => Promise<void>,
): Promise<void> {
	const server = createServer((_request, response) => {
		response.end("local response");
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});

	try {
		const address = server.address() as AddressInfo;
		await run(`http://127.0.0.1:${address.port}`);
	} finally {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()));
		});
	}
}

describe("mocked MCP test support", () => {
	let restoreExternalNetworking: (() => void) | undefined;

	beforeAll(() => {
		restoreExternalNetworking = disableMockedMcpExternalNetworking(() =>
			nock.enableNetConnect(),
		);
	});

	afterEach(async () => {
		await cleanupMockedMcpTestState();
	});

	afterAll(() => {
		restoreExternalNetworking?.();
	});

	it("rejects unexpected network requests while external networking is disabled", async () => {
		const hevyClient = createMockedHevyClient({ maxGetRetries: 0 });

		await expect(hevyClient.getWorkoutCount()).rejects.toThrow(
			/Disallowed net connect|No match for request/,
		);
	});

	it("reports unused interceptors during cleanup and still removes them", async () => {
		createMockedApiScope().get("/v1/workouts/count").reply(200, {
			workout_count: 42,
		});

		await expect(cleanupMockedMcpTestState()).rejects.toMatchObject({
			errors: [
				expect.objectContaining({
					message: expect.stringContaining("Unused Nock interceptors"),
				}),
			],
		});
	});

	it("preserves scope behavior and tracks every supported interceptor builder", async () => {
		const scope = createMockedApiScope();

		expect(
			(scope as { readonly [Symbol.toStringTag]?: string })[Symbol.toStringTag],
		).toBeUndefined();
		expect(scope.isDone()).toBe(true);

		scope.get("/get").reply(200);
		scope.post("/post").reply(200);
		scope.put("/put").reply(200);
		scope.head("/head").reply(200);
		scope.patch("/patch").reply(200);
		scope.merge("/merge").reply(200);
		scope.delete("/delete").reply(200);
		scope.options("/options").reply(200);
		scope.intercept("/intercept", "TRACE").reply(200);

		expect(scope.isDone()).toBe(false);
		await expect(cleanupMockedMcpTestState()).rejects.toMatchObject({
			errors: [
				expect.objectContaining({
					message: expect.stringContaining("Unused Nock interceptors"),
				}),
			],
		});
		expect(nock.activeMocks()).not.toEqual(
			expect.arrayContaining([expect.stringContaining(MOCK_HEVY_API_BASE_URL)]),
		);
	});

	it("ignores and preserves unrelated Nock interceptors during cleanup", async () => {
		const unrelatedInterceptor = nock(MOCK_HEVY_API_BASE_URL).get("/unrelated");
		unrelatedInterceptor.reply(200, "unrelated response");

		try {
			await expect(cleanupMockedMcpTestState()).resolves.toBeUndefined();
			await expect(
				requestText(`${MOCK_HEVY_API_BASE_URL}/unrelated`),
			).resolves.toBe("unrelated response");
		} finally {
			nock.removeInterceptor(unrelatedInterceptor);
		}
	});

	it("aggregates harness close and shared cleanup failures", async () => {
		const closeFailure = new Error("intentional close failure");
		createMockedApiScope().get("/unused-during-teardown").reply(200);

		await expect(
			teardownMockedMcpTestState({
				name: "failing-close",
				close: async () => {
					throw closeFailure;
				},
			}),
		).rejects.toMatchObject({
			errors: [
				closeFailure,
				expect.objectContaining({
					message: expect.stringContaining("Unused Nock interceptors"),
				}),
			],
		});
	});

	it("closes composed registrations once and aggregates transport failures", async () => {
		const firstRegistration = vi.fn();
		const secondRegistration = vi.fn();
		const harness = await createMockedMcpHarness({
			name: "aggregate-close",
			register: composeMockedComponentRegistration(
				firstRegistration,
				secondRegistration,
			),
		});
		const closeFailures = [
			new Error("intentional client close failure"),
			new Error("intentional server close failure"),
		];
		const closeClient = harness.client.close.bind(harness.client);
		const closeServer = harness.server.close.bind(harness.server);
		vi.spyOn(harness.client, "close").mockRejectedValue(closeFailures[0]);
		vi.spyOn(harness.server, "close").mockRejectedValue(closeFailures[1]);

		expect(firstRegistration).toHaveBeenCalledWith(
			harness.server,
			expect.any(Object),
		);
		expect(secondRegistration).toHaveBeenCalledWith(
			harness.server,
			expect.any(Object),
		);
		await expect(harness.close()).rejects.toMatchObject({
			errors: closeFailures,
			message: 'Failed to close mocked MCP harness "aggregate-close"',
		});
		await expect(harness.close()).resolves.toBeUndefined();

		vi.restoreAllMocks();
		await Promise.allSettled([closeClient(), closeServer()]);
	});

	it("cleans up transports when harness registration fails", async () => {
		const registrationFailure = new Error("intentional registration failure");

		await expect(
			createMockedMcpHarness({
				name: "registration-failure",
				register: () => {
					throw registrationFailure;
				},
			}),
		).rejects.toBe(registrationFailure);
		await expect(cleanupMockedMcpTestState()).resolves.toBeUndefined();
	});

	it("reports leaked harnesses during cleanup and force-closes them", async () => {
		await createMockedMcpHarness({
			name: "intentional-leak",
			register: () => undefined,
		});

		await expect(cleanupMockedMcpTestState()).rejects.toMatchObject({
			errors: [
				expect.objectContaining({
					message: expect.stringContaining(
						"Unclosed mocked MCP harnesses: intentional-leak",
					),
				}),
			],
		});
	});

	it("aggregates leaked harness close failures without losing leak details", async () => {
		const harness = await createMockedMcpHarness({
			name: "failing-leak-close",
			register: () => undefined,
		});
		const closeFailure = new Error("intentional leaked close failure");
		const closeSpy = vi.spyOn(harness, "close").mockRejectedValue(closeFailure);

		try {
			await expect(cleanupMockedMcpTestState()).rejects.toMatchObject({
				errors: [
					expect.objectContaining({
						message: expect.stringContaining(
							"Unclosed mocked MCP harnesses: failing-leak-close",
						),
					}),
					closeFailure,
				],
			});
		} finally {
			closeSpy.mockRestore();
			await harness.close();
		}
	});

	it("does not require structured content from writes or failed reads", async () => {
		const harness = await createMockedMcpHarness({
			name: "structured-content-branches",
			register: (server) => {
				server.registerTool("create-test", {}, async () => ({
					content: [{ type: "text", text: "created" }],
				}));
				server.registerTool("get-failing-test", {}, async () => ({
					content: [{ type: "text", text: "failed" }],
					isError: true,
				}));
			},
		});

		try {
			await expect(
				callTool(
					harness.client,
					"create-test",
					{},
					{ requireStructuredContentForReadTools: true },
				),
			).resolves.toMatchObject({ text: "created" });
			await expect(
				callTool(
					harness.client,
					"get-failing-test",
					{},
					{ requireStructuredContentForReadTools: true },
				),
			).resolves.toMatchObject({ isError: true, text: "failed" });
		} finally {
			await harness.close();
		}
	});

	it("allows teardown without a harness when shared state is clean", async () => {
		await expect(
			teardownMockedMcpTestState(undefined),
		).resolves.toBeUndefined();
	});

	it("isolates the exercise-template cache between fresh harnesses", async () => {
		const register = (
			server: Parameters<typeof registerTemplateTools>[0],
			client: Parameters<typeof registerTemplateTools>[1],
		) => {
			registerTemplateTools(server, client);
		};
		const firstHarness = await createMockedMcpHarness({
			name: "cache-isolation-first",
			register,
		});
		createMockedApiScope()
			.get("/v1/exercise_templates")
			.query({ page: 1, pageSize: 100 })
			.reply(
				200,
				createExerciseTemplatesResponse([
					createExerciseTemplateFixture({
						id: "first-template",
						title: "First Press",
					}),
				]),
			);

		const firstResult = await callTool(
			firstHarness.client,
			"search-exercise-templates",
			{ query: "First" },
			{ requireStructuredContentForReadTools: true },
		);
		expect(firstResult.text).toContain("first-template");
		await firstHarness.close();

		const secondHarness = await createMockedMcpHarness({
			name: "cache-isolation-second",
			register,
		});
		createMockedApiScope()
			.get("/v1/exercise_templates")
			.query({ page: 1, pageSize: 100 })
			.reply(
				200,
				createExerciseTemplatesResponse([
					createExerciseTemplateFixture({
						id: "second-template",
						title: "Second Press",
					}),
				]),
			);

		const secondResult = await callTool(
			secondHarness.client,
			"search-exercise-templates",
			{ query: "Second" },
			{ requireStructuredContentForReadTools: true },
		);
		expect(secondResult.text).toContain("second-template");
		expect(secondResult.text).not.toContain("first-template");
		await secondHarness.close();
	});

	it("rejects malformed text content and missing structured content", () => {
		const missingText = { content: [] } satisfies CallToolResult;
		const malformedText = {
			content: [{ type: "image", data: "", mimeType: "image/png" }],
		} satisfies CallToolResult;
		const missingStructuredContent = {
			content: [{ type: "text", text: "{}" }],
		} satisfies CallToolResult;
		const malformedJson = { text: "{" };

		expect(() => getToolText(missingText)).toThrow(
			"Expected first MCP tool response content to be text",
		);
		expect(() => getToolText(malformedText)).toThrow(
			"Expected first MCP tool response content to be text",
		);
		expect(() =>
			requireStructuredContent(missingStructuredContent, "test-tool"),
		).toThrow("Expected structured content from test-tool");
		expect(() => parseToolText(malformedJson, "test-tool")).toThrow(
			"Expected valid JSON text from test-tool",
		);
	});

	it("keeps fixture defaults immutable across overrides", () => {
		const callerOwnedTemplates = [
			{
				id: "caller-template",
				title: "Caller Press",
				secondary_muscle_groups: ["triceps"],
			},
		];
		const overridden = createExerciseTemplateFixture({
			title: "Overridden Press",
			secondary_muscle_groups: ["shoulders"],
		});
		const response = createExerciseTemplatesResponse(callerOwnedTemplates);
		const routine = createRoutineFixture();
		const routinesResponse = createRoutinesResponse();

		expect(Object.isFrozen(overridden)).toBe(true);
		expect(Object.isFrozen(overridden.secondary_muscle_groups)).toBe(true);
		expect(Object.isFrozen(response.exercise_templates)).toBe(true);
		expect(Object.isFrozen(routine)).toBe(true);
		expect(Object.isFrozen(routine.exercises)).toBe(true);
		expect(Object.isFrozen(routinesResponse)).toBe(true);
		expect(Object.isFrozen(routinesResponse.routines)).toBe(true);
		expect(Object.isFrozen(callerOwnedTemplates)).toBe(false);
		expect(Object.isFrozen(callerOwnedTemplates[0])).toBe(false);
		expect(() => {
			(overridden as { title?: string }).title = "Mutated";
		}).toThrow();
		callerOwnedTemplates[0]!.title = "Still Mutable";

		const fresh = createExerciseTemplateFixture();
		expect(fresh.title).toBe("Bench Press");
		expect(fresh.secondary_muscle_groups).toEqual(["triceps"]);
		expect(response.exercise_templates?.[0]?.title).toBe("Caller Press");
	});
});

describe.sequential("mocked MCP external network isolation", () => {
	afterEach(() => {
		nock.enableNetConnect();
	});

	it("restores a pre-disabled network policy without widening it", async () => {
		await withLocalHttpServer(async (url) => {
			nock.enableNetConnect();
			nock.disableNetConnect();
			const restore = disableMockedMcpExternalNetworking(() =>
				nock.disableNetConnect(),
			);

			restore();
			restore();

			await expect(requestText(url)).rejects.toThrow(/Disallowed net connect/);
		});
	});

	it("keeps nested isolation active until the final release", async () => {
		await withLocalHttpServer(async (url) => {
			nock.enableNetConnect();
			const restoreOuter = disableMockedMcpExternalNetworking(() =>
				nock.enableNetConnect(),
			);
			const restoreInner = disableMockedMcpExternalNetworking(() =>
				nock.disableNetConnect(),
			);

			restoreInner();
			await expect(requestText(url)).rejects.toThrow(/Disallowed net connect/);

			restoreOuter();
			await expect(requestText(url)).resolves.toBe("local response");
		});
	});

	it("restores a matcher-restricted policy without widening it", async () => {
		await withLocalHttpServer(async (url) => {
			const localOnly = /^127\.0\.0\.1(?::\d+)?$/;
			nock.enableNetConnect();
			nock.enableNetConnect(localOnly);
			const restore = disableMockedMcpExternalNetworking(() =>
				nock.enableNetConnect(localOnly),
			);

			restore();

			await expect(requestText(url)).resolves.toBe("local response");
			await expect(requestText("http://blocked.invalid")).rejects.toThrow(
				/Disallowed net connect/,
			);
		});
	});
});
