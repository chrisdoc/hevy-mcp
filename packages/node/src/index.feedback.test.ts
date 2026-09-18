import { InMemoryTransport } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNodeMcpServer } from "./index.js";

describe("Node embedding feedback option", () => {
	let client: Client | undefined;
	let server: Awaited<ReturnType<typeof createNodeMcpServer>> | undefined;

	afterEach(async () => {
		await Promise.all([client?.close(), server?.close()]);
		client = undefined;
		server = undefined;
	});

	it("forwards an embedding recorder and accepts recorded feedback", async () => {
		const feedbackRecorder = {
			record: vi.fn(() => ({ accepted: true as const })),
		};
		server = await createNodeMcpServer({
			apiKey: "embedding-test-key",
			feedbackRecorder,
		});
		client = new Client({
			name: "embedding-feedback-test-client",
			version: "1.0.0",
		});
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await Promise.all([
			server.connect(serverTransport),
			client.connect(clientTransport),
		]);

		const result = await client.callTool({
			name: "feedback",
			arguments: { message: "technical feedback" },
		});

		expect(result.isError).not.toBe(true);
		expect(result.structuredContent).toEqual({ accepted: true });
		expect(feedbackRecorder.record).toHaveBeenCalledOnce();
		expect(feedbackRecorder.record).toHaveBeenCalledWith("technical feedback");
	});
});
