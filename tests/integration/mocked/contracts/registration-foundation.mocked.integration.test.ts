import nock from "nock";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
	HEVY_MCP_SERVER_INSTRUCTIONS,
	HEVY_MCP_SERVER_INFO,
	HEVY_MCP_SERVER_OPTIONS,
	registerHevyMcp,
} from "../../../../src/mcp-registration.js";
import {
	EXPECTED_MCP_PROMPT_COUNT,
	EXPECTED_MCP_RESOURCE_COUNT,
	EXPECTED_MCP_TOOL_COUNT,
	MCP_PROMPT_CONTRACTS,
	MCP_RESOURCE_CONTRACTS,
	MCP_TOOL_CONTRACTS,
} from "../../../support/mcp-contract-inventory.js";
import {
	cleanupMockedMcpTestState,
	createMockedMcpHarness,
	disableMockedMcpExternalNetworking,
} from "../../../support/mocked-mcp.js";

const sorted = (values: readonly string[]) => [...values].sort();

describe("production MCP registration contract foundation", () => {
	let restoreExternalNetworking: (() => void) | undefined;

	beforeAll(() => {
		restoreExternalNetworking = disableMockedMcpExternalNetworking(() =>
			nock.enableNetConnect(),
		);
	});

	afterEach(async () => {
		await cleanupMockedMcpTestState();
	});

	afterAll(() => {
		restoreExternalNetworking?.();
	});

	it("advertises the exact inventoried tools, prompts, and resources", async () => {
		const harness = await createMockedMcpHarness({
			name: "production-registration-inventory",
			serverInfo: HEVY_MCP_SERVER_INFO,
			serverOptions: HEVY_MCP_SERVER_OPTIONS,
			register: registerHevyMcp,
		});

		try {
			const [tools, prompts, resources] = await Promise.all([
				harness.client.listTools(),
				harness.client.listPrompts(),
				harness.client.listResources(),
			]);

			expect(MCP_TOOL_CONTRACTS).toHaveLength(EXPECTED_MCP_TOOL_COUNT);
			expect(MCP_PROMPT_CONTRACTS).toHaveLength(EXPECTED_MCP_PROMPT_COUNT);
			expect(MCP_RESOURCE_CONTRACTS).toHaveLength(EXPECTED_MCP_RESOURCE_COUNT);
			expect(tools.tools).toHaveLength(EXPECTED_MCP_TOOL_COUNT);
			expect(prompts.prompts).toHaveLength(EXPECTED_MCP_PROMPT_COUNT);
			expect(resources.resources).toHaveLength(EXPECTED_MCP_RESOURCE_COUNT);

			expect(sorted(tools.tools.map(({ name }) => name))).toEqual(
				sorted(MCP_TOOL_CONTRACTS.map(({ name }) => name)),
			);
			expect(prompts.prompts).toEqual(
				MCP_PROMPT_CONTRACTS.map(
					({ name, title, description, arguments: promptArguments }) => ({
						name,
						title,
						description,
						arguments: [...promptArguments],
					}),
				),
			);
			expect(resources.resources).toEqual(
				MCP_RESOURCE_CONTRACTS.map(({ name, uri, description, mimeType }) => ({
					name,
					uri,
					description,
					mimeType,
				})),
			);
		} finally {
			await harness.close();
		}
	});

	it("advertises deterministic server and tool metadata", async () => {
		const harness = await createMockedMcpHarness({
			name: "production-registration-metadata",
			serverInfo: HEVY_MCP_SERVER_INFO,
			serverOptions: HEVY_MCP_SERVER_OPTIONS,
			register: registerHevyMcp,
		});

		try {
			const capabilities = harness.client.getServerCapabilities();
			const tools = await harness.client.listTools();
			const toolsByName = new Map(tools.tools.map((tool) => [tool.name, tool]));

			expect(harness.client.getInstructions()).toBe(
				HEVY_MCP_SERVER_INSTRUCTIONS,
			);
			expect(harness.client.getServerVersion()).toEqual(HEVY_MCP_SERVER_INFO);
			expect(capabilities).toEqual({
				logging: {},
				prompts: { listChanged: true },
				resources: { listChanged: true },
				tools: { listChanged: true },
			});

			for (const contract of MCP_TOOL_CONTRACTS) {
				const tool = toolsByName.get(contract.name);
				expect(tool, contract.name).toBeDefined();
				expect(tool?.description, `${contract.name} description`).toBeTruthy();
				expect(tool?.execution, `${contract.name} execution`).toEqual({
					taskSupport: "forbidden",
				});
				expect(
					Boolean(tool?.outputSchema),
					`${contract.name} output schema`,
				).toBe(contract.structuredOutput);

				const annotations = tool?.annotations;
				expect(annotations?.openWorldHint, contract.name).toBe(false);
				if (contract.annotations === "read") {
					expect(annotations?.readOnlyHint, contract.name).toBe(true);
				} else if (contract.annotations === "create") {
					expect(annotations, contract.name).toMatchObject({
						readOnlyHint: false,
						destructiveHint: false,
						idempotentHint: false,
					});
				} else {
					expect(annotations, contract.name).toMatchObject({
						readOnlyHint: false,
						destructiveHint: true,
						idempotentHint: true,
					});
				}
			}
		} finally {
			await harness.close();
		}
	});
});
