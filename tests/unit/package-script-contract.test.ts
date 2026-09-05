import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");

describe("repository package scripts", () => {
	it("loads the optional worktree dotenv file for integration tests", () => {
		const packageJson = JSON.parse(
			readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
		) as { scripts?: Record<string, string> };
		const integrationScript = packageJson.scripts?.["test:integration"];

		expect(integrationScript).toContain("node --env-file-if-exists=.env");
		expect(integrationScript).toContain(
			"node_modules/vitest/vitest.mjs run tests/integration",
		);
	});

	it("keeps the live lane fail-closed through its preflight wrapper", () => {
		const packageJson = JSON.parse(
			readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
		) as { scripts?: Record<string, string> };
		const liveScript = packageJson.scripts?.["test:live"];

		expect(liveScript).toContain(
			"node --env-file-if-exists=.env scripts/run-live-vitest.mjs",
		);
		expect(liveScript).toContain(
			"HEVY_API_KEY tests/integration/hevy-mcp.integration.test.ts",
		);
	});
});
