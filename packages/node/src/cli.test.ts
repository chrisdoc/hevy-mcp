import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const cliSource = fileURLToPath(new URL("./cli.ts", import.meta.url));
const tsxLoader = fileURLToPath(
	new URL("../../../node_modules/tsx/dist/loader.mjs", import.meta.url),
);

function runCli(args: string[], env: NodeJS.ProcessEnv = {}) {
	return new Promise<{ code: number | null; stderr: string }>(
		(resolve, reject) => {
			const child = spawn(
				process.execPath,
				["--import", tsxLoader, cliSource, ...args],
				{
					cwd: repositoryRoot,
					env: {
						...process.env,
						HEVY_MCP_TELEMETRY: "0",
						...env,
					},
					stdio: ["ignore", "pipe", "pipe"],
				},
			);
			let stderr = "";
			child.stderr.setEncoding("utf8");
			child.stderr.on("data", (chunk: string) => {
				stderr += chunk;
			});
			child.once("error", reject);
			child.once("close", (code) => resolve({ code, stderr }));
		},
	);
}

describe("CLI startup failures", () => {
	it("prints the typed parser message and exits before transport startup", async () => {
		const result = await runCli(["--port", "3001"]);

		expect(result.code).toBe(1);
		expect(result.stderr).toBe(
			"--host and --port can only be used with --transport http.\n",
		);
	});

	it.each([401, 403])(
		"prints the stable invalid-key message for an HTTP %s startup probe",
		async (status) => {
			const result = await runCli([], {
				HEVY_API_KEY: "fake-invalid-key",
				STARTUP_FETCH_STATUS: String(status),
				NODE_OPTIONS: `--import ${fileURLToPath(new URL("./fixtures/startup-fetch.mjs", import.meta.url))}`,
			});

			expect(result.code).toBe(1);
			expect(result.stderr).toBe(
				"HEVY_API_KEY is invalid or expired. Please check your API key in the Hevy app under Settings > API Key.\n",
			);
		},
	);

	it("keeps arbitrary startup errors behind the safe diagnostic projection", async () => {
		const secret = "arbitrary-startup-secret";
		const result = await runCli(
			["--transport", "http", "--host", "192.0.2.1"],
			{
				HEVY_API_KEY: "fake-startup-key",
				HEVY_MCP_HTTP_BEARER_TOKEN: secret,
				STARTUP_FETCH_STATUS: "200",
				NODE_OPTIONS: `--import ${fileURLToPath(new URL("./fixtures/startup-fetch.mjs", import.meta.url))}`,
			},
		);

		expect(result.code).toBe(1);
		expect(result.stderr).toContain("Fatal error in main()");
		expect(result.stderr).not.toContain(secret);
		expect(result.stderr).not.toContain("requires");
	});
});
