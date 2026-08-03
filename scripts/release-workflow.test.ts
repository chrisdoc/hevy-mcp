import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateReleaseOutputs } from "./release-outputs.mjs";

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
const publishContainer = workflow.slice(
	workflow.indexOf("  publish-container:"),
	workflow.indexOf("  deploy-production:"),
);

function workerManifest(version: string, dependency = "1.0.0") {
	return JSON.stringify({
		name: "@hevy-mcp/worker",
		version,
		dependencies: { example: dependency },
	});
}

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
		expect(workflow).toContain("node scripts/release-outputs.mjs");
		expect(
			calculateReleaseOutputs({
				beforeWorkerManifest: workerManifest("1.0.0", "1.0.0"),
				afterWorkerManifest: workerManifest("1.0.0", "2.0.0"),
				published: false,
				publishedPackages: [],
			}).worker_released,
		).toBe(false);
		expect(
			calculateReleaseOutputs({
				beforeWorkerManifest: workerManifest("1.0.0"),
				afterWorkerManifest: workerManifest("1.0.1"),
				published: false,
				publishedPackages: [],
			}).worker_released,
		).toBe(true);
	});

	it.each([
		["CLI-only", [{ name: "@chrisdoc/hevy-cli", version: "1.0.2" }], false, ""],
		["Node-only", [{ name: "hevy-mcp", version: "5.0.5" }], true, "5.0.5"],
		[
			"mixed",
			[
				{ name: "@chrisdoc/hevy-cli", version: "1.0.2" },
				{ name: "hevy-mcp", version: "5.0.5" },
			],
			true,
			"5.0.5",
		],
	])(
		"derives the Node container gate for a %s publication",
		(_label, publishedPackages, nodeReleased, version) => {
			const outputs = calculateReleaseOutputs({
				beforeWorkerManifest: workerManifest("1.0.0"),
				afterWorkerManifest: workerManifest("1.0.0"),
				published: true,
				publishedPackages,
			});

			expect(outputs.node_released).toBe(nodeReleased);
			expect(outputs.version).toBe(version);
		},
	);

	it("gates the container on the Node package release", () => {
		expect(publishContainer).toContain(
			"needs.release.outputs.node_released == 'true'",
		);
		expect(publishContainer).not.toContain(
			"needs.release.outputs.released == 'true'",
		);
	});

	it("versions private packages without publishing tags", () => {
		expect(changesetConfig.privatePackages).toEqual({
			version: true,
			tag: false,
		});
	});
});
