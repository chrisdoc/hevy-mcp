import { afterEach, describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createHevyClient } from "@hevy-mcp/hevy-client";
import { createHevyMcpServer } from "../server.js";

function json(body: unknown) {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

describe("get-workouts page schema", () => {
	const closers: Array<() => Promise<void>> = [];
	afterEach(async () => {
		await Promise.all(closers.splice(0).map((close) => close()));
	});

	async function connect(fetchImpl: typeof fetch) {
		const server = await createHevyMcpServer({
			createClient: ({ onLog }) =>
				createHevyClient({
					apiKey: "00000000-0000-4000-8000-000000000000",
					baseUrl: "https://hevy.test",
					fetch: fetchImpl,
					maxGetRetries: 0,
					onLog,
				}),
		});
		const client = new Client({ name: "page-schema-test", version: "1.0.0" });
		const [a, b] = InMemoryTransport.createLinkedPair();
		await Promise.all([server.connect(b), client.connect(a)]);
		closers.push(async () => {
			await client.close();
			await server.close();
		});
		return client;
	}

	it("advertises an integer page and rejects 1.5 before calling Hevy", async () => {
		const pages: string[] = [];
		const client = await connect(((input: RequestInfo | URL) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			pages.push(url.searchParams.get("page") ?? "");
			return Promise.resolve(json({ page: 1, page_count: 1, workouts: [] }));
		}) as typeof fetch);

		const { tools } = await client.listTools();
		const advertised = tools.find((tool) => tool.name === "get-workouts")
			?.inputSchema.properties?.page as { type?: string } | undefined;
		await client.callTool({ name: "get-workouts", arguments: { page: 1.5 } });

		expect(advertised?.type).toBe("integer");
		expect(pages).toEqual([]);
	});
});
