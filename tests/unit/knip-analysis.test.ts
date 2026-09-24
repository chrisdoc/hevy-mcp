import { cp, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const fixtureTemplate = fileURLToPath(
	new URL("../fixtures/knip-analysis/", import.meta.url),
);
const knipCli = fileURLToPath(
	new URL("../../node_modules/knip/bin/knip.js", import.meta.url),
);

let temporaryDirectory: string;
let fixtureDirectory: string;

beforeAll(async () => {
	temporaryDirectory = await mkdtemp(join(tmpdir(), "hevy-knip-fixture-"));
	fixtureDirectory = join(temporaryDirectory, "workspace");
	await cp(fixtureTemplate, fixtureDirectory, { recursive: true });
});

afterAll(async () => {
	await rm(temporaryDirectory, { force: true, recursive: true });
});

describe("Knip analysis configuration", () => {
	it("reports dead internal code while preserving real roots and public exports", () => {
		const result = spawnSync(
			process.execPath,
			[knipCli, "--no-progress", "--reporter", "compact"],
			{ cwd: fixtureDirectory, encoding: "utf8" },
		);

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(result.stdout).toContain("Unused files (1)");
		expect(result.stdout).toContain("src/dead-helper.ts");
		expect(result.stdout).toContain("Unused exports (1)");
		expect(result.stdout).toContain("unusedInternalExport");
		expect(result.stdout).not.toContain("publicApi");
		expect(result.stdout).not.toContain("scripts/check.mjs");
		expect(result.stdout).not.toContain("scripts/check-helper.mjs");
		expect(result.stdout).not.toContain("dynamic-integration.mjs");
		expect(result.stdout).not.toContain("host-plugin.mjs");
	});
});
