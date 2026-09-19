import type { HevyClient } from "@hevy-mcp/hevy-client";
import { afterEach, describe, expect, it, vi } from "vitest";

// Capture the real client supplied by the public Node constructor. Only MCP
// registration is replaced: request encoding, fetch, and retries stay real.
const captured = vi.hoisted(() => ({
	client: undefined as HevyClient | undefined,
}));
vi.mock("@hevy-mcp/core", () => ({
	createHevyMcpServer: (options: {
		createClient: (context: { onLog: () => void }) => HevyClient;
	}) => {
		captured.client = options.createClient({ onLog: () => undefined });
		return {};
	},
}));
import { createNodeMcpServer } from "./index.js";

const workout = {
	workout: {
		title: "Synthetic workout",
		description: "",
		is_private: true,
		start_time: "2026-01-01T10:00:00Z",
		end_time: "2026-01-01T11:00:00Z",
		exercises: [],
	},
};
const routine = {
	routine: {
		title: "Synthetic routine",
		folder_id: null,
		notes: "",
		exercises: [],
	},
};
const writes = [
	{
		name: "create workout",
		method: "POST",
		path: "/v1/workouts",
		body: workout,
		invoke: (client: HevyClient) => client.createWorkout(workout),
	},
	{
		name: "update workout",
		method: "PUT",
		path: "/v1/workouts/synthetic-id",
		body: workout,
		invoke: (client: HevyClient) =>
			client.updateWorkout("synthetic-id", workout),
	},
	{
		name: "create routine",
		method: "POST",
		path: "/v1/routines",
		body: routine,
		invoke: (client: HevyClient) => client.createRoutine(routine),
	},
	{
		name: "update routine",
		method: "PUT",
		path: "/v1/routines/synthetic-id",
		body: routine,
		invoke: (client: HevyClient) =>
			client.updateRoutine("synthetic-id", routine),
	},
];

afterEach(() => {
	captured.client = undefined;
	vi.unstubAllGlobals();
});

describe("Node zero-retry client transport", () => {
	for (const write of writes) {
		for (const failure of ["503", "429", "connection-reset"] as const) {
			it(`${write.name}: one ${write.method} attempt on ${failure}`, async () => {
				const fetchMock = vi.fn<typeof fetch>();
				if (failure === "connection-reset") {
					fetchMock.mockRejectedValue(
						new TypeError("Synthetic connection reset"),
					);
				} else {
					fetchMock.mockImplementation(() =>
						Promise.resolve(
							new Response("{}", {
								status: Number(failure),
								headers: {
									"content-type": "application/json",
									"retry-after": "0",
								},
							}),
						),
					);
				}
				vi.stubGlobal("fetch", fetchMock);
				await createNodeMcpServer({
					apiKey: "synthetic-test-key",
					maxGetRetries: 0,
				});
				if (!captured.client)
					throw new Error("Node constructor did not supply a client");
				await expect(write.invoke(captured.client)).rejects.toBeDefined();
				expect(fetchMock).toHaveBeenCalledTimes(1);
				const call = fetchMock.mock.calls[0];
				if (!call) throw new Error("Expected a fetch call");
				const [url, init] = call;
				expect(url).toEqual(new URL(`https://api.hevyapp.com${write.path}`));
				expect(init?.method).toBe(write.method);
				expect(init?.body).toBe(JSON.stringify(write.body));
			});
		}
	}
	it("also disables GET retries when explicitly configured", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockImplementation(() =>
				Promise.resolve(new Response("{}", { status: 503 })),
			);
		vi.stubGlobal("fetch", fetchMock);
		await createNodeMcpServer({
			apiKey: "synthetic-test-key",
			maxGetRetries: 0,
		});
		if (!captured.client) throw new Error("Missing client");
		await expect(
			captured.client.getWorkout("synthetic-id"),
		).rejects.toBeDefined();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
