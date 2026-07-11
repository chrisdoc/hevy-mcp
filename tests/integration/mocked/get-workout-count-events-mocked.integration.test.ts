import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import nock from "nock";
import { registerWorkoutTools } from "../../../src/tools/workouts.js";
import {
	createWorkoutCountResponse,
	createWorkoutFixture,
} from "../../support/hevy-fixtures.js";
import {
	callTool,
	createMockedApiScope,
	createMockedMcpHarness,
	disableMockedMcpExternalNetworking,
	type MockedMcpHarness,
	parseToolText,
	teardownMockedMcpTestState,
} from "../../support/mocked-mcp.js";

describe("Hevy MCP workout detail endpoints mocked tests", () => {
	let harness: MockedMcpHarness | null = null;
	let restoreExternalNetworking: (() => void) | undefined;

	beforeAll(() => {
		restoreExternalNetworking = disableMockedMcpExternalNetworking(() =>
			nock.enableNetConnect(),
		);
	});

	beforeEach(async () => {
		harness = await createMockedMcpHarness({
			name: "hevy-mcp-workout-detail-test",
			register: (server, hevyClient) => {
				registerWorkoutTools(server, hevyClient);
			},
		});
	});

	afterEach(async () => {
		const harnessToClose = harness;
		harness = null;
		await teardownMockedMcpTestState(harnessToClose);
	});

	afterAll(() => {
		restoreExternalNetworking?.();
	});

	it("mocks get-workout-count through MCP transport", async () => {
		if (!harness) throw new Error("Harness not initialized");

		createMockedApiScope()
			.get("/v1/workouts/count")
			.reply(200, createWorkoutCountResponse());

		const result = await callTool(harness.client, "get-workout-count", {});
		const payload = parseToolText<{ count: number }>(result);

		expect(result.isError).toBeFalsy();
		expect(payload.count).toBe(42);
		expect(result.structuredContent).toEqual({ count: 42 });
	});

	it("mocks get-workout-events through MCP transport", async () => {
		if (!harness) throw new Error("Harness not initialized");

		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		try {
			createMockedApiScope()
				.get("/v1/workouts/events")
				.query(true)
				.reply(200, {
					page: 1,
					page_count: 1,
					events: [
						{
							type: "updated",
							workout: {
								id: "workout-1",
								title: "Updated Workout",
								start_time: "2025-03-27T08:00:00Z",
								end_time: "2025-03-27T08:30:00Z",
								exercises: [],
							},
						},
					],
				});

			const result = await callTool(harness.client, "get-workout-events", {
				page: 1,
				pageSize: 5,
				since: "1970-01-01T00:00:00Z",
			});
			const payload = parseToolText<
				Array<{
					type?: string;
					workout?: { id?: string };
				}>
			>(result);

			expect(result.isError).toBeFalsy();
			expect(Array.isArray(payload)).toBe(true);
			expect(payload.length).toBeGreaterThan(0);
			expect(payload[0]).toMatchObject({
				type: "updated",
				workout: { id: "workout-1" },
			});
			expect(result.structuredContent).toEqual({ events: payload });
		} finally {
			consoleErrorSpy.mockRestore();
		}
	});

	it("mocks get-workout for a known workout through MCP transport", async () => {
		if (!harness) throw new Error("Harness not initialized");

		createMockedApiScope()
			.get("/v1/workouts/workout-1")
			.reply(
				200,
				createWorkoutFixture({
					title: "Mock Detail Workout",
					description: "Lower body session",
				}),
			);

		const result = await callTool(harness.client, "get-workout", {
			workoutId: "workout-1",
		});
		const payload = parseToolText<{
			id?: string;
			title?: string;
			duration?: string;
		}>(result);

		expect(result.isError).toBeFalsy();
		expect(payload).toMatchObject({
			id: "workout-1",
			title: "Mock Detail Workout",
			duration: "1h 0m 0s",
		});
		expect(result.structuredContent).toEqual({ workout: payload });
	});
});
