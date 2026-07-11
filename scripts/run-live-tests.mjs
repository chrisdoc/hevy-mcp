import { spawnSync } from "node:child_process";

if (!process.env.HEVY_API_KEY) {
	console.error(
		"HEVY_API_KEY is required for test:live; no live tests were started.",
	);
	process.exit(1);
}

const result = spawnSync(
	process.execPath,
	[
		"node_modules/vitest/vitest.mjs",
		"run",
		"tests/integration/hevy-mcp.integration.test.ts",
		...process.argv.slice(2),
	],
	{
		stdio: "inherit",
		env: process.env,
	},
);

if (result.error) {
	throw result.error;
}

process.exit(result.status ?? 1);
