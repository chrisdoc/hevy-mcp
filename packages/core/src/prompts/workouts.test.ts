import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerWorkoutPrompts } from "./workouts.js";

describe("workout prompts", () => {
	let client: Client;
	let server: McpServer;

	beforeEach(async () => {
		server = new McpServer({ name: "prompt-test-server", version: "1.0.0" });
		registerWorkoutPrompts(server);

		client = new Client({ name: "prompt-test-client", version: "1.0.0" });
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await Promise.all([
			server.connect(serverTransport),
			client.connect(clientTransport),
		]);
	});

	afterEach(async () => {
		await Promise.all([client.close(), server.close()]);
	});

	it("lists both prompts with discoverable metadata and argument schemas", async () => {
		const result = await client.listPrompts();

		expect(result.prompts).toHaveLength(2);
		expect(result.prompts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "analyze-workout-progress",
					title: "Analyze Workout Progress",
					description: expect.stringContaining("workout"),
					arguments: expect.arrayContaining([
						expect.objectContaining({
							name: "weeks",
							required: false,
						}),
					]),
				}),
				expect.objectContaining({
					name: "create-workout-from-routine",
					title: "Create Workout From Routine",
					description: expect.stringContaining("routine"),
					arguments: expect.arrayContaining([
						expect.objectContaining({ name: "routineId", required: false }),
						expect.objectContaining({ name: "startTime", required: false }),
					]),
				}),
			]),
		);
	});

	it("coerces a string week count in prompts/get", async () => {
		const result = await client.getPrompt({
			name: "analyze-workout-progress",
			arguments: { weeks: "6" },
		});

		expect(result.messages).toEqual([
			expect.objectContaining({
				role: "user",
				content: expect.objectContaining({
					type: "text",
					text: expect.stringContaining("last 6 weeks"),
				}),
			}),
		]);
		expect(result.messages[0]?.content).toEqual(
			expect.objectContaining({
				text: expect.stringContaining("get-training-summary"),
			}),
		);
	});

	it("uses the default week count with explicit empty arguments", async () => {
		const result = await client.getPrompt({
			name: "analyze-workout-progress",
			arguments: {},
		});

		expect(result.messages[0]?.content).toEqual(
			expect.objectContaining({
				text: expect.stringContaining("last 4 weeks"),
			}),
		);
	});

	it("rejects omitting the entire arguments object at the SDK boundary", async () => {
		await expect(
			client.getPrompt({ name: "analyze-workout-progress" }),
		).rejects.toThrow(/arguments/i);
	});

	it.each(["0", "13", "2.5", "not-a-number"])(
		"rejects invalid week value %s",
		async (weeks) => {
			await expect(
				client.getPrompt({
					name: "analyze-workout-progress",
					arguments: { weeks },
				}),
			).rejects.toThrow();
		},
	);

	it("returns routine-to-workout guidance without inventing completion data", async () => {
		const result = await client.getPrompt({
			name: "create-workout-from-routine",
			arguments: {
				routineId: "routine-123",
				startTime: "2026-07-10T08:00:00Z",
			},
		});

		expect(result.messages).toHaveLength(1);
		expect(result.messages[0]).toEqual(
			expect.objectContaining({
				role: "user",
				content: expect.objectContaining({
					type: "text",
					text: expect.stringMatching(
						/get-routine[\s\S]*restSeconds[\s\S]*repRange[\s\S]*endTime[\s\S]*Never invent/,
					),
				}),
			}),
		);
	});

	it("rejects an invalid workout start timestamp", async () => {
		await expect(
			client.getPrompt({
				name: "create-workout-from-routine",
				arguments: {
					routineId: "routine-123",
					startTime: "2026-07-10T08:00:00+00:00",
				},
			}),
		).rejects.toThrow();
	});

	it("returns a generic preview when routine arguments are omitted", async () => {
		const result = await client.getPrompt({
			name: "create-workout-from-routine",
			arguments: {},
		});

		expect(result.messages[0]?.content).toEqual(
			expect.objectContaining({
				text: "Provide a routineId and startTime to generate the full prompt.",
			}),
		);
	});
});
