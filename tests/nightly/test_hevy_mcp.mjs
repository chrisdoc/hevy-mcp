/**
 * Nightly integration test for hevy-mcp using the MCP TypeScript SDK.
 *
 * Spawns the published hevy-mcp package from npm and verifies:
 *   1. The MCP server starts correctly.
 *   2. Tools are properly registered.
 *   3. Expected tools (get-workouts, get-routines, get-exercise-templates)
 *      are present.
 *   4. A basic tool call works (get-workouts) when an API key is provided.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const EXPECTED_TOOLS = [
	"get-workouts",
	"get-routines",
	"get-exercise-templates",
];

function fail(message) {
	console.error(`::error::${message}`);
	process.exit(1);
}

function parseLauncherConfig() {
	const apiKey = process.env.HEVY_API_KEY;
	if (!apiKey) {
		fail("HEVY_API_KEY environment variable not set");
	}

	const command = process.env.HEVY_MCP_COMMAND?.trim();
	if (!command) {
		fail("HEVY_MCP_COMMAND cannot be empty. Example: HEVY_MCP_COMMAND=npx");
	}

	const argsJson = process.env.HEVY_MCP_ARGS_JSON;
	if (!argsJson) {
		fail(
			'HEVY_MCP_ARGS_JSON cannot be empty. Example: HEVY_MCP_ARGS_JSON=\'["-y", "hevy-mcp@latest"]\'',
		);
	}

	let args;
	try {
		const parsed = JSON.parse(argsJson);
		if (
			!Array.isArray(parsed) ||
			!parsed.every((arg) => typeof arg === "string")
		) {
			throw new Error("must be a JSON array of strings");
		}
		if (parsed.length === 0) {
			throw new Error("must not be empty");
		}
		args = parsed;
	} catch (error) {
		fail(`HEVY_MCP_ARGS_JSON is invalid: ${error.message}`);
	}

	return { apiKey, command, args };
}

async function main() {
	const { apiKey, command, args } = parseLauncherConfig();
	console.log(
		`Configuring hevy-mcp launcher: command=${JSON.stringify(command)} args=${JSON.stringify(args)}`,
	);

	const transport = new StdioClientTransport({
		command,
		args,
		env: { ...process.env, HEVY_API_KEY: apiKey },
	});

	const client = new Client(
		{
			name: "hevy-mcp-nightly-test",
			version: "1.0.0",
		},
		{
			capabilities: {},
		},
	);

	try {
		console.log("Launching and connecting to npm MCP server...");
		await client.connect(transport);
		console.log("Connected successfully!");

		console.log("Listing available tools...");
		const toolsResponse = await client.listTools();
		const toolNames = toolsResponse.tools.map((tool) => tool.name);
		console.log(
			`Found ${toolNames.length} tools: ${JSON.stringify(toolNames)}`,
		);

		const missingTools = EXPECTED_TOOLS.filter(
			(name) => !toolNames.includes(name),
		);
		if (missingTools.length > 0) {
			fail(`Missing expected tools: ${JSON.stringify(missingTools)}`);
		}
		console.log("All expected tools are registered.");

		console.log("Calling get-workouts tool...");
		const result = await client.callTool({
			name: "get-workouts",
			arguments: { page: 1, pageSize: 1 },
		});
		const firstContent = result.content?.[0];
		if (firstContent?.type === "text" && firstContent.text) {
			console.log(
				`get-workouts returned: ${firstContent.text.slice(0, 200)}...`,
			);
		} else {
			console.log(
				"get-workouts returned empty content (may be expected if no workouts)",
			);
		}

		console.log("\nAll tests passed!");
	} catch (error) {
		fail(`Test failed: ${error?.stack || error}`);
	} finally {
		try {
			await client.close();
		} catch (error) {
			console.error(`Error while closing client: ${error?.message || error}`);
		}
	}
}

main().catch((error) => {
	console.error(`Unhandled error: ${error?.stack || error}`);
	process.exit(1);
});
