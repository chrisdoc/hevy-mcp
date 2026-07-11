import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import nock from "nock";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { registerTemplateTools } from "../../src/tools/templates.js";
import {
	createExerciseTemplateFixture,
	createExerciseTemplatesResponse,
} from "./hevy-fixtures.js";
import {
	callTool,
	cleanupMockedMcpTestState,
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

		expect(Object.isFrozen(overridden)).toBe(true);
		expect(Object.isFrozen(overridden.secondary_muscle_groups)).toBe(true);
		expect(Object.isFrozen(response.exercise_templates)).toBe(true);
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
