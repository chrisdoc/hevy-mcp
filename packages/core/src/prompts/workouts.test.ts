import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerRoutinePrompts } from "./routines.js";
import { registerWorkoutPrompts } from "./workouts.js";

describe("workout prompts", () => {
	let client: Client;
	let server: McpServer;

	beforeEach(async () => {
		server = new McpServer({ name: "prompt-test-server", version: "1.0.0" });
		registerWorkoutPrompts(server);
		registerRoutinePrompts(server);

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

	it("lists all prompts with discoverable metadata and argument schemas", async () => {
		const result = await client.listPrompts();

		expect(result.prompts).toHaveLength(3);
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
				expect.objectContaining({
					name: "create-routine-from-goals",
					title: "Create Routine From Goals",
					description: expect.stringContaining("goal"),
					arguments: undefined,
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
				text: expect.stringMatching(
					/get-training-summary[\s\S]*three to five[\s\S]*two to four[\s\S]*fewer than two[\s\S]*body measurements/,
				),
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
						/get-routine[\s\S]*restSeconds[\s\S]*repRange[\s\S]*endTime[\s\S]*Never treat[\s\S]*explicit approval[\s\S]*call create-workout once/,
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

	it("returns a conversational discovery workflow when workout arguments are omitted", async () => {
		const result = await client.getPrompt({
			name: "create-workout-from-routine",
			arguments: {},
		});

		expect(result.messages[0]?.content).toEqual(
			expect.objectContaining({
				text: expect.stringMatching(
					/search-routines[\s\S]*get-routines[\s\S]*timezone[\s\S]*Never invent[\s\S]*explicit approval/,
				),
			}),
		);
	});

	it("uses provided workout arguments while collecting only the missing value", async () => {
		const result = await client.getPrompt({
			name: "create-workout-from-routine",
			arguments: { routineId: "routine-123" },
		});

		expect(result.messages[0]?.content).toEqual(
			expect.objectContaining({
				text: expect.stringMatching(
					/Use routine routine-123[\s\S]*Ask when the workout started/,
				),
			}),
		);
	});

	it("provides a no-argument goal interview and confirmed routine workflow", async () => {
		const result = await client.getPrompt({
			name: "create-routine-from-goals",
		});

		expect(result.messages).toHaveLength(1);
		expect(result.messages[0]?.content).toEqual(
			expect.objectContaining({
				type: "text",
				text: expect.stringMatching(
					/goal[\s\S]*get-training-summary[\s\S]*get-routines[\s\S]*search-exercise-templates[\s\S]*Never guess[\s\S]*explicit approval[\s\S]*exactly once/,
				),
			}),
		);
	});
});
