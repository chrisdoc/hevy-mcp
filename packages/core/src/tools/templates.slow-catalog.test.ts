import { afterEach, describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createHevyClient } from "@hevy-mcp/hevy-client";
import { createHevyMcpServer } from "../server.js";

// HEVY-MCP-6N: one full catalog load is slower than one call's budget but
// fits in the budget of a few calls.

const TEMPLATE_COUNT = 430;
const PAGE_SIZE = 100;
const PAGE_LATENCY_MS = 120;
// One full load needs 5 * 120 = 600 ms. Each call gets 400 ms.
const EXECUTION_TIMEOUT_MS = 400;

const templates = Array.from({ length: TEMPLATE_COUNT }, (_, index) => ({
	id: `T${String(index).padStart(4, "0")}`,
	title: index === 7 ? "Bench Press (Barbell)" : `Exercise ${index}`,
	type: "weight_reps",
	primary_muscle_group: "chest",
	secondary_muscle_groups: [],
	is_custom: false,
}));
const pageCount = Math.ceil(TEMPLATE_COUNT / PAGE_SIZE);

function createSlowTemplateFetch(requestedPages: number[]) {
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		const page = Number(url.searchParams.get("page") ?? "1");
		const pageSize = Number(url.searchParams.get("pageSize") ?? "5");
		requestedPages.push(page);
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(resolve, PAGE_LATENCY_MS);
			init?.signal?.addEventListener(
				"abort",
				() => {
					clearTimeout(timer);
					reject(init.signal?.reason);
				},
				{ once: true },
			);
		});
		const start = (page - 1) * pageSize;
		return new Response(
			JSON.stringify({
				page,
				page_count: pageCount,
				exercise_templates: templates.slice(start, start + pageSize),
			}),
			{ status: 200, headers: { "content-type": "application/json" } },
		);
	}) as typeof fetch;
}

describe("search-exercise-templates under a slow catalog (HEVY-MCP-6N)", () => {
	const closers: Array<() => Promise<void>> = [];
	afterEach(async () => {
		await Promise.all(closers.splice(0).map((close) => close()));
	});

	async function connect(
		executionTimeoutMs: number,
		requestedPages: number[],
		lifecycleSignal?: AbortSignal,
	) {
		const server = await createHevyMcpServer({
			createClient: ({ onLog }) =>
				createHevyClient({
					apiKey: "00000000-0000-4000-8000-000000000000",
					baseUrl: "https://hevy.test",
					fetch: createSlowTemplateFetch(requestedPages),
					onLog,
				}),
			executionTimeoutMs,
			lifecycleSignal,
		});
		const client = new Client({ name: "slow-catalog-test", version: "1.0.0" });
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await Promise.all([
			server.connect(serverTransport),
			client.connect(clientTransport),
		]);
		closers.push(async () => {
			await client.close();
			await server.close();
		});
		return client;
	}

	it("control: a budget that fits one full load succeeds and fetches each page once", async () => {
		const requestedPages: number[] = [];
		const client = await connect(5_000, requestedPages);
		const result = await client.callTool({
			name: "search-exercise-templates",
			arguments: { query: "bench" },
		});
		expect(result.isError).not.toBe(true);
		expect(requestedPages).toEqual([1, 2, 3, 4, 5]);
	});

	it("makes progress across repeated calls instead of restarting the catalog load from page 1 every time", async () => {
		const requestedPages: number[] = [];
		const client = await connect(EXECUTION_TIMEOUT_MS, requestedPages);
		const outcomes: string[] = [];
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const result = await client.callTool({
				name: "search-exercise-templates",
				arguments: { query: "bench" },
			});
			outcomes.push(result.isError ? "error" : "ok");
		}

		expect(requestedPages).toEqual([1, 2, 3, 4, 5]);
		expect(outcomes).toContain("ok");
	});

	it("stops an abandoned catalog load when the caller-owned lifecycle ends", async () => {
		const requestedPages: number[] = [];
		const lifecycle = new AbortController();
		const client = await connect(
			EXECUTION_TIMEOUT_MS,
			requestedPages,
			lifecycle.signal,
		);
		const result = await client.callTool({
			name: "search-exercise-templates",
			arguments: { query: "bench" },
		});
		expect(result.isError).toBe(true);

		lifecycle.abort(new DOMException("request finished", "AbortError"));
		await new Promise((resolve) => setTimeout(resolve, PAGE_LATENCY_MS * 3));
		expect(requestedPages).not.toContain(pageCount);
	});
});
