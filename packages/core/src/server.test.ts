import { afterEach, describe, expect, it } from "vitest";
import { createHevyMcpServer } from "./server.js";
import { createMockHevyClient } from "../test-fixtures/mock-hevy.js";

describe("createHevyMcpServer", () => {
	const servers: Array<{ close(): Promise<void> }> = [];

	afterEach(async () => {
		await Promise.all(
			servers.splice(0).map(async (server) => {
				await server.close();
			}),
		);
	});

	it("keeps the Promise-compatible close façade idempotent", async () => {
		const server = createHevyMcpServer({
			createClient: () => createMockHevyClient(),
		});
		servers.push(server);

		await expect(
			Promise.all([server.close(), server.close()]),
		).resolves.toEqual([undefined, undefined]);
	});
});
