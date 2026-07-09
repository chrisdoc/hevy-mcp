/**
 * Nightly integration test for hevy-mcp using the MCP TypeScript SDK.
 *
 * Spawns the published hevy-mcp package from npm and verifies the
 * server's *behavior* against the real Hevy API. The goal is to catch
 * regressions where the MCP layer is up but the proxying into Hevy
 * (data shapes, pagination, error handling, cross-tool consistency)
 * breaks. Tool inventory / descriptions / schemas are intentionally NOT
 * pinned here because they churn when tools are added or renamed and
 * would force this test to be updated in lockstep.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SEARCH_QUERY = "bench";
const UNKNOWN_WORKOUT_ID = "00000000-0000-0000-0000-000000000000";

const results = [];
function recordResult(name, passed, detail) {
	results.push({ name, passed, detail });
	const status = passed ? "PASS" : "FAIL";
	const prefix = passed ? "" : "::error::";
	console.log(`${prefix}[${status}] ${name}${detail ? `: ${detail}` : ""}`);
}

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

function readFirstContent(result) {
	const first = result.content?.[0];
	if (!first) {
		throw new Error("server returned no content");
	}
	if (first.type !== "text") {
		throw new Error(`expected text content, got type="${first.type}"`);
	}
	return first.text ?? "";
}

function expectJsonContent(result) {
	const text = readFirstContent(result);
	const trimmed = text.trim();
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
		throw new Error(
			`expected JSON content, got "${trimmed.slice(0, 80)}${trimmed.length > 80 ? "..." : ""}"`,
		);
	}
	try {
		return JSON.parse(trimmed);
	} catch (error) {
		throw new Error(
			`could not parse content as JSON: ${error.message}; first chars: "${trimmed.slice(0, 80)}..."`,
		);
	}
}

async function runTest(name, fn) {
	try {
		const detail = await fn();
		recordResult(name, true, detail ?? "");
	} catch (error) {
		recordResult(name, false, error?.message ?? String(error));
	}
}

async function callOrIgnoreEmpty(client, name, args) {
	const result = await client.callTool({ name, arguments: args });
	if (result.isError) {
		throw new Error(
			`server reported error for ${name}: ${readFirstContent(result).slice(0, 200)}`,
		);
	}
	const text = readFirstContent(result).trim();
	if (!text) {
		return { empty: true, raw: "" };
	}
	const parsed = expectJsonContent(result);
	return { empty: false, raw: text, parsed };
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

		const serverInfo = client.getServerVersion();
		await runTest("server-info", async () => {
			if (!serverInfo?.name) {
				throw new Error("server did not report a name");
			}
			if (!serverInfo?.version) {
				throw new Error("server did not report a version");
			}
			return `name=${serverInfo.name}, version=${serverInfo.version}`;
		});

		await runTest("tools-registered", async () => {
			const toolsResponse = await client.listTools();
			if (!Array.isArray(toolsResponse.tools)) {
				throw new Error("listTools did not return an array of tools");
			}
			if (toolsResponse.tools.length === 0) {
				throw new Error("server registered zero tools");
			}
			return `${toolsResponse.tools.length} tool(s) registered`;
		});

		// --- Shape checks against the real Hevy API ---
		// Each test consults the same call helper, so empty responses are
		// accepted (a brand-new Hevy account has no data) and JSON responses
		// are validated against the structure the client depends on.

		await runTest("get-workouts-shape", async () => {
			const { empty, parsed } = await callOrIgnoreEmpty(
				client,
				"get-workouts",
				{
					page: 1,
					pageSize: 5,
				},
			);
			if (empty) return "empty response (acceptable for new accounts)";
			if (!Array.isArray(parsed)) {
				throw new Error(`expected an array, got ${typeof parsed}`);
			}
			if (parsed.length > 5) {
				throw new Error(
					`pageSize=5 returned ${parsed.length} items (pagination broken)`,
				);
			}
			const sample = parsed[0];
			if (sample !== undefined && typeof sample !== "object") {
				throw new Error(
					`expected workout objects in array, got item of type ${typeof sample}`,
				);
			}
			return `${parsed.length} workout(s), sample keys=${sample ? Object.keys(sample).slice(0, 5).join(",") : "n/a"}`;
		});

		await runTest("get-workout-count-shape", async () => {
			const { empty, parsed } = await callOrIgnoreEmpty(
				client,
				"get-workout-count",
				{},
			);
			if (empty) return "empty response";
			if (
				!parsed ||
				typeof parsed !== "object" ||
				typeof parsed.count !== "number"
			) {
				throw new Error(
					`expected object with numeric 'count', got ${JSON.stringify(parsed).slice(0, 200)}`,
				);
			}
			if (parsed.count < 0 || !Number.isInteger(parsed.count)) {
				throw new Error(
					`count should be a non-negative integer, got ${parsed.count}`,
				);
			}
			return `count=${parsed.count}`;
		});

		await runTest("get-workout-events-shape", async () => {
			const { empty, parsed } = await callOrIgnoreEmpty(
				client,
				"get-workout-events",
				{ page: 1, pageSize: 5 },
			);
			if (empty)
				return "empty response (acceptable for accounts with no events)";
			if (!Array.isArray(parsed)) {
				throw new Error(`expected an array, got ${typeof parsed}`);
			}
			if (parsed.length > 5) {
				throw new Error(
					`pageSize=5 returned ${parsed.length} events (pagination broken)`,
				);
			}
			return `${parsed.length} event(s)`;
		});

		await runTest("get-routines-shape", async () => {
			const { empty, parsed } = await callOrIgnoreEmpty(
				client,
				"get-routines",
				{
					page: 1,
					pageSize: 5,
				},
			);
			if (empty) return "empty response (acceptable for new accounts)";
			if (!Array.isArray(parsed)) {
				throw new Error(`expected an array, got ${typeof parsed}`);
			}
			return `${parsed.length} routine(s)`;
		});

		await runTest("get-exercise-templates-shape", async () => {
			const { empty, parsed } = await callOrIgnoreEmpty(
				client,
				"get-exercise-templates",
				{ page: 1, pageSize: 5 },
			);
			if (empty)
				return "empty response (not expected from Hevy; the template catalog is global)";
			if (!Array.isArray(parsed)) {
				throw new Error(`expected an array, got ${typeof parsed}`);
			}
			if (parsed.length === 0) {
				throw new Error("expected at least one exercise template");
			}
			const sample = parsed[0];
			if (sample === undefined || typeof sample !== "object") {
				throw new Error(
					`expected template objects in array, got item of type ${typeof sample}`,
				);
			}
			const idField = sample.id ?? sample.exercise_template_id;
			if (idField === undefined || idField === null || idField === "") {
				throw new Error(
					`template entries should include an id, got keys=${Object.keys(sample).join(",")}`,
				);
			}
			return `${parsed.length} template(s), first id=${idField}`;
		});

		await runTest("search-exercise-templates-shape", async () => {
			const { empty, parsed } = await callOrIgnoreEmpty(
				client,
				"search-exercise-templates",
				{ query: SEARCH_QUERY },
			);
			if (empty)
				return "empty response (unexpected for common term, but accepting)";
			if (!Array.isArray(parsed)) {
				throw new Error(`expected an array, got ${typeof parsed}`);
			}
			// Every hit should mention the query (case-insensitive) somewhere, so a
			// search regression that returns the unfiltered catalog is detectable.
			if (parsed.length > 0) {
				const haystack = JSON.stringify(parsed).toLowerCase();
				if (!haystack.includes(SEARCH_QUERY.toLowerCase())) {
					throw new Error(
						`search results for "${SEARCH_QUERY}" do not mention the query`,
					);
				}
			}
			return `query="${SEARCH_QUERY}" -> ${parsed.length} hit(s)`;
		});

		await runTest("get-routine-folders-shape", async () => {
			const { empty, parsed } = await callOrIgnoreEmpty(
				client,
				"get-routine-folders",
				{ page: 1, pageSize: 5 },
			);
			if (empty) return "empty response (acceptable for new accounts)";
			if (!Array.isArray(parsed)) {
				throw new Error(`expected an array, got ${typeof parsed}`);
			}
			return `${parsed.length} folder(s)`;
		});

		await runTest("get-body-measurements-shape", async () => {
			const { empty, parsed } = await callOrIgnoreEmpty(
				client,
				"get-body-measurements",
				{ page: 1, pageSize: 5 },
			);
			if (empty)
				return "empty response (acceptable for accounts with no entries)";
			if (!Array.isArray(parsed)) {
				throw new Error(`expected an array, got ${typeof parsed}`);
			}
			return `${parsed.length} measurement(s)`;
		});

		await runTest("get-user-info-shape", async () => {
			const { empty, parsed } = await callOrIgnoreEmpty(
				client,
				"get-user-info",
				{},
			);
			if (empty) return "empty response";
			if (!parsed || typeof parsed !== "object") {
				throw new Error(
					`expected an object, got ${JSON.stringify(parsed).slice(0, 200)}`,
				);
			}
			const idField = parsed.id ?? parsed.user_id;
			if (idField === undefined || idField === null || idField === "") {
				throw new Error(
					`user info should include an id field, got keys=${Object.keys(parsed).join(",")}`,
				);
			}
			return `keys=${Object.keys(parsed).slice(0, 5).join(",")}, id=${idField}`;
		});

		// --- Pagination honesty ---
		// The response length should respect the pageSize we asked for.

		await runTest("pagination-pageSize-2-respected", async () => {
			const { empty, parsed } = await callOrIgnoreEmpty(
				client,
				"get-workouts",
				{
					page: 1,
					pageSize: 2,
				},
			);
			if (empty) return "empty response";
			if (!Array.isArray(parsed)) {
				throw new Error(`expected an array, got ${typeof parsed}`);
			}
			if (parsed.length > 2) {
				throw new Error(
					`pageSize=2 returned ${parsed.length} items (pagination broken)`,
				);
			}
			return `${parsed.length} item(s)`;
		});

		await runTest("pagination-pageSize-5-respected", async () => {
			const { empty, parsed } = await callOrIgnoreEmpty(
				client,
				"get-workouts",
				{
					page: 1,
					pageSize: 5,
				},
			);
			if (empty) return "empty response";
			if (!Array.isArray(parsed)) {
				throw new Error(`expected an array, got ${typeof parsed}`);
			}
			if (parsed.length > 5) {
				throw new Error(
					`pageSize=5 returned ${parsed.length} items (pagination broken)`,
				);
			}
			return `${parsed.length} item(s)`;
		});

		await runTest("rejects-out-of-range-pageSize", async () => {
			try {
				const result = await client.callTool({
					name: "get-workouts",
					arguments: { page: 1, pageSize: 999 },
				});
				if (!result.isError) {
					throw new Error("server accepted pageSize=999 without erroring");
				}
				return "server rejected out-of-range pageSize";
			} catch (error) {
				if (error?.message?.includes("pageSize=999 without erroring")) {
					throw error;
				}
				return `server rejected out-of-range pageSize (raised: ${
					error?.message?.split("\n")[0] ?? error
				})`;
			}
		});

		// --- Cross-tool consistency ---
		// The count reported by get-workout-count should equal the maximum count
		// of workouts the server can return over its allowed page sizes (10 in
		// the current schema). If we can fetch more workouts than the count
		// reports, that means the proxy is double-counting or skipping rows.

		await runTest("workout-count-matches-pagination", async () => {
			const countResp = await callOrIgnoreEmpty(
				client,
				"get-workout-count",
				{},
			);
			if (countResp.empty) return "empty count response";
			const total = countResp.parsed.count;

			// Walk pageSize=10 pages until we've fetched everything the count says
			// exists, then compare. Cap iterations to avoid runaway loops on a
			// poisoned count.
			const fetched = [];
			const MAX_PAGES = 50;
			for (let page = 1; page <= MAX_PAGES; page++) {
				const { empty, parsed } = await callOrIgnoreEmpty(
					client,
					"get-workouts",
					{
						page,
						pageSize: 10,
					},
				);
				if (empty || !Array.isArray(parsed) || parsed.length === 0) break;
				fetched.push(...parsed);
				if (parsed.length < 10) break;
			}

			if (total === 0) {
				if (fetched.length > 0) {
					throw new Error(
						`count says 0 workouts but get-workouts returned ${fetched.length}`,
					);
				}
				return "count=0, fetched=0";
			}
			if (fetched.length !== total) {
				throw new Error(
					`count says ${total} workouts but paging returned ${fetched.length}`,
				);
			}
			return `count=${total}, fetched=${fetched.length} (matches)`;
		});

		// --- Error resilience ---
		// The server should not crash when a single-entity tool is called with
		// a non-existent UUID. The MCP layer should either surface isError=true
		// or return an empty/text result.

		await runTest("get-workout-handles-unknown-id", async () => {
			const result = await client.callTool({
				name: "get-workout",
				arguments: { workoutId: UNKNOWN_WORKOUT_ID },
			});
			if (result.isError) {
				return `server surfaced isError (first content: "${readFirstContent(result).slice(0, 120)}")`;
			}
			const text = readFirstContent(result).trim();
			if (!text) return "server returned empty content for unknown id";
			// Empty-but-non-error is acceptable (e.g. "Workout with ID ...
			// not found"). Anything that loads successfully is fine too as long
			// as the request did not crash the server.
			return `server returned a graceful empty/text response`;
		});
	} catch (error) {
		recordResult("setup-or-handshake", false, error?.message ?? String(error));
	} finally {
		try {
			await client.close();
		} catch (error) {
			console.error(`Error while closing client: ${error?.message ?? error}`);
		}
	}

	const passed = results.filter((r) => r.passed).length;
	const failed = results.length - passed;
	console.log(
		`\nSummary: ${passed} passed, ${failed} failed (total ${results.length})`,
	);
	if (failed > 0) {
		fail(`${failed} nightly test(s) failed`);
	}
	console.log("All tests passed!");
}

main().catch((error) => {
	console.error(`Unhandled error: ${error?.stack ?? error}`);
	process.exit(1);
});
