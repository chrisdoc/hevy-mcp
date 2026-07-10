import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmMutation } from "./mutation-confirmation.js";

function createMockServer(
	options: {
		capabilities?: unknown;
		result?: unknown;
	} = {},
) {
	const capabilities = Object.hasOwn(options, "capabilities")
		? options.capabilities
		: { elicitation: { form: {} } };
	const result = options.result ?? {
		action: "accept",
		content: { confirm: true },
	};
	const getClientCapabilities = vi.fn(() => capabilities);
	const elicitInput = vi.fn().mockResolvedValue(result);
	const server = {
		server: { getClientCapabilities, elicitInput },
	} as unknown as McpServer;

	return { elicitInput, getClientCapabilities, server };
}

describe("confirmMutation", () => {
	it("bypasses capability checks and elicitation by default", async () => {
		const { elicitInput, getClientCapabilities, server } = createMockServer({
			capabilities: undefined,
		});

		await expect(
			confirmMutation(server, {
				message: "Create workout?",
			}),
		).resolves.toEqual({ confirmed: true });
		expect(getClientCapabilities).not.toHaveBeenCalled();
		expect(elicitInput).not.toHaveBeenCalled();
	});

	it("confirms only an accepted response with confirm=true", async () => {
		const { elicitInput, server } = createMockServer();

		await expect(
			confirmMutation(server, {
				confirmMutations: true,
				message: "Create workout 'Morning' with 3 exercises?",
			}),
		).resolves.toEqual({ confirmed: true });
		expect(elicitInput).toHaveBeenCalledWith({
			mode: "form",
			message: "Create workout 'Morning' with 3 exercises?",
			requestedSchema: {
				type: "object",
				properties: {
					confirm: {
						type: "boolean",
						title: "Confirm",
						default: false,
					},
				},
				required: ["confirm"],
			},
		});
	});

	it.each([
		[
			"accept with confirm=false",
			{ action: "accept", content: { confirm: false } },
		],
		["decline", { action: "decline" }],
		["cancel", { action: "cancel" }],
	])("cancels without mutation for %s", async (_label, result) => {
		const { server } = createMockServer({ result });

		const confirmation = await confirmMutation(server, {
			confirmMutations: true,
			message: "Replace routine?",
		});

		expect(confirmation).toMatchObject({
			confirmed: false,
			response: {
				content: [{ text: "Mutation canceled. No changes were made." }],
			},
		});
		if (confirmation.confirmed) {
			throw new Error("Expected mutation cancellation");
		}
		expect(confirmation.response.isError).not.toBe(true);
	});

	it.each([
		["missing capabilities", undefined],
		["missing elicitation", {}],
		["missing form elicitation", { elicitation: {} }],
	])("fails closed for %s", async (_label, capabilities) => {
		const { elicitInput, server } = createMockServer({ capabilities });

		const confirmation = await confirmMutation(server, {
			confirmMutations: true,
			message: "Create folder?",
		});

		expect(confirmation).toMatchObject({
			confirmed: false,
			response: {
				isError: true,
				content: [
					{
						text: expect.stringMatching(
							/confirmation is enabled.*form elicitation.*not made/i,
						),
					},
				],
			},
		});
		expect(elicitInput).not.toHaveBeenCalled();
	});

	it("propagates elicitation errors", async () => {
		const { elicitInput, server } = createMockServer();
		elicitInput.mockRejectedValueOnce(
			new Error("elicitation transport failed"),
		);

		await expect(
			confirmMutation(server, {
				confirmMutations: true,
				message: "Create measurement?",
			}),
		).rejects.toThrow("elicitation transport failed");
	});
});

describe("confirmMutation protocol wiring", () => {
	let client: Client | undefined;
	let server: McpServer | undefined;

	afterEach(async () => {
		await Promise.all([client?.close(), server?.close()]);
	});

	it("uses negotiated form elicitation through InMemoryTransport", async () => {
		server = new McpServer({ name: "confirmation-server", version: "1.0.0" });
		client = new Client(
			{ name: "confirmation-client", version: "1.0.0" },
			{ capabilities: { elicitation: { form: {} } } },
		);
		client.setRequestHandler(ElicitRequestSchema, async (request) => {
			expect(request.params).toMatchObject({
				mode: "form",
				message: "Create routine 'Push Day' with 4 exercises?",
				requestedSchema: {
					type: "object",
					required: ["confirm"],
					properties: { confirm: { type: "boolean" } },
				},
			});
			return { action: "accept", content: { confirm: true } };
		});

		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await Promise.all([
			server.connect(serverTransport),
			client.connect(clientTransport),
		]);

		await expect(
			confirmMutation(server, {
				confirmMutations: true,
				message: "Create routine 'Push Day' with 4 exercises?",
			}),
		).resolves.toEqual({ confirmed: true });
	});
});
