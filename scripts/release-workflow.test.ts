import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = await readFile(
	resolve(import.meta.dirname, "../.github/workflows/release.yml"),
	"utf8",
);
const changesetConfig = JSON.parse(
	await readFile(
		resolve(import.meta.dirname, "../.changeset/config.json"),
		"utf8",
	),
) as {
	privatePackages?: { tag?: boolean; version?: boolean };
};
const deployProduction = workflow.slice(
	workflow.indexOf("  deploy-production:"),
);

describe("release workflow", () => {
	it("deploys production only when the Worker package was released", () => {
		expect(deployProduction).toContain(
			"needs.release.outputs.worker_released == 'true'",
		);
		expect(deployProduction).not.toContain(
			"needs.release.outputs.released == 'true'",
		);
	});

	it("detects Worker releases from the versioned private manifest", () => {
		expect(workflow).toContain("worker_released=false");
		expect(workflow).toContain("-- packages/worker/package.json");
		expect(workflow).toContain("worker_released=true");
	});

	it("versions private packages without publishing tags", () => {
		expect(changesetConfig.privatePackages).toEqual({
			version: true,
			tag: false,
		});
	});
});
