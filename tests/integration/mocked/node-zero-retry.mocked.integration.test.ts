import { Client, type JSONObject } from "@modelcontextprotocol/client";
import {
	InMemoryTransport,
	type McpServer,
} from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createNodeMcpServer as createPackagedServer } from "../../../packages/node/dist/index.mjs";

// Keep Node source in its own workspace type environment: this root project
// also loads Worker globals. Exercise the real source at runtime using the
// built public signature; packages/node's check:types checks its implementation.
const sourceEntry = "../../../packages/node/src/index.js";
const {
	createNodeMcpServer,
}: {
	createNodeMcpServer: typeof createPackagedServer;
} = await import(sourceEntry);

// Real public constructors, core, operations and MCP protocol. Only fetch is
// replaced; an unexpected request cannot escape to the network.
const workout = {
	title: "Synthetic workout",
	description: "",
	is_private: true,
	start_time: "2026-01-01T10:00:00Z",
	end_time: "2026-01-01T11:00:00Z",
	exercises: [],
};
const routine = {
	title: "Synthetic routine",
	notes: "",
	exercises: [
		{
			exercise_template_id: "synthetic-template",
			sets: [{ type: "normal", reps: 5 }],
		},
	],
};
const routinePut = {
	title: routine.title,
	notes: "",
	exercises: [
		{
			exercise_template_id: "synthetic-template",
			notes: null,
			rest_seconds: null,
			superset_id: null,
			sets: [
				{
					type: "normal",
					reps: 5,
					weight_kg: null,
					distance_meters: null,
					duration_seconds: null,
					custom_metric: null,
				},
			],
		},
	],
};
const routinePost = {
	...routinePut,
	folder_id: null,
	exercises: [
		{
			...routinePut.exercises[0],
			sets: [{ ...routinePut.exercises[0]?.sets[0], rep_range: null }],
		},
	],
};
const workoutResponse = { id: "synthetic-id", ...workout };
const routineResponse = { id: "synthetic-id", ...routine };
interface Route {
	name: string;
	method: string;
	path: string;
	args: JSONObject;
	body?: object;
	response: object;
	preRead?: boolean;
}
const routes: Route[] = [
	{
		name: "get-workouts",
		method: "GET",
		path: "/v1/workouts?page=1&pageSize=1",
		args: { page: 1, page_size: 1 },
		response: { page: 1, page_count: 1, workouts: [workoutResponse] },
	},
	{
		name: "get-workout",
		method: "GET",
		path: "/v1/workouts/synthetic-id",
		args: { workout_id: "synthetic-id" },
		response: workoutResponse,
	},
	{
		name: "get-routines",
		method: "GET",
		path: "/v1/routines?page=1&pageSize=1",
		args: { page: 1, page_size: 1 },
		response: { page: 1, page_count: 1, routines: [routineResponse] },
	},
	{
		name: "get-routine",
		method: "GET",
		path: "/v1/routines/synthetic-id",
		args: { routine_id: "synthetic-id" },
		response: { routine: routineResponse },
	},
	{
		name: "create-workout",
		method: "POST",
		path: "/v1/workouts",
		args: { workout },
		body: { workout },
		response: workoutResponse,
	},
	{
		name: "update-workout",
		method: "PUT",
		path: "/v1/workouts/synthetic-id",
		args: {
			workout_id: "synthetic-id",
			workout: { title: workout.title, is_private: true },
		},
		body: { workout },
		response: workoutResponse,
		preRead: true,
	},
	{
		name: "create-routine",
		method: "POST",
		path: "/v1/routines",
		args: { routine },
		body: { routine: routinePost },
		response: routineResponse,
	},
	{
		name: "update-routine",
		method: "PUT",
		path: "/v1/routines/synthetic-id",
		args: { routine_id: "synthetic-id", routine },
		body: { routine: routinePut },
		response: routineResponse,
	},
];
let server: McpServer | undefined;
let client: Client | undefined;
afterEach(async () => {
	await client?.close();
	await server?.close();
	client = undefined;
	server = undefined;
	vi.unstubAllGlobals();
});
for (const [label, construct] of [
	["source", createNodeMcpServer],
	["package export", createPackagedServer],
] as const) {
	describe(`${label}: real MCP with explicit zero retries`, () => {
		for (const route of routes) {
			for (const outcome of [
				"success",
				401,
				403,
				429,
				503,
				"connection-reset",
			] as const) {
				it(`${route.name}: ${outcome}`, async () => {
					const requests: {
						method: string;
						path: string;
						body: object | null;
					}[] = [];
					const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
						const url = new URL(input instanceof Request ? input.url : input);
						const body = z.string().nullish().parse(init?.body);
						await Promise.resolve();
						const method = init?.method ?? "GET";
						const path = url.pathname + url.search;
						requests.push({
							method,
							path,
							body: body ? (JSON.parse(body) as object) : null,
						});
						if (url.origin !== "https://api.hevyapp.com")
							throw new Error("Unexpected origin");
						if (route.preRead && method === "GET" && path === route.path)
							return Response.json(workoutResponse);
						if (method !== route.method || path !== route.path)
							throw new Error("Unexpected route");
						if (outcome === "connection-reset")
							throw new TypeError("Synthetic connection reset");
						return Response.json(outcome === "success" ? route.response : {}, {
							status:
								outcome === "success"
									? route.method === "POST"
										? 201
										: 200
									: outcome,
							headers: { "retry-after": "0" },
						});
					});
					vi.stubGlobal("fetch", fetchMock);
					server = await construct({
						apiKey: "synthetic-offline-key",
						maxGetRetries: 0,
					});
					client = new Client({
						name: "synthetic-acceptance",
						version: "1.0.0",
					});
					const [clientTransport, serverTransport] =
						InMemoryTransport.createLinkedPair();
					await Promise.all([
						client.connect(clientTransport),
						server.connect(serverTransport),
					]);
					const result = await client.request({
						method: "tools/call",
						params: { name: route.name, arguments: route.args },
					});
					expect(requests).toEqual([
						...(route.preRead
							? [{ method: "GET", path: route.path, body: null }]
							: []),
						{
							method: route.method,
							path: route.path,
							body: route.body ?? null,
						},
					]);
					expect(result.isError === true).toBe(outcome !== "success");
					if (outcome === "success" && route.name === "get-routine") {
						expect(result.structuredContent).toMatchObject({
							routine: { id: "synthetic-id", title: routine.title },
						});
					}
					// Snapshot only public protocol fields, not stack/debug metadata. Source
					// and built export must match the same reviewed response/error contract.
					expect({
						content: result.content,
						structuredContent: result.structuredContent,
						isError: result.isError,
					}).toMatchSnapshot(`${route.name}: ${outcome}`);
				});
			}
		}
	});
}
