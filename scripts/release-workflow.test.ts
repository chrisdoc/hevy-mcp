import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateReleaseOutputs } from "./release-outputs.mjs";
import {
	MAX_WORKER_PREVIEW_TAG_LENGTH,
	resolveWorkerPreviewTag,
	resolveWorkerVersion,
} from "./resolve-worker-version.mjs";

const workflow = await readFile(
	resolve(import.meta.dirname, "../.github/workflows/release.yml"),
	"utf8",
);
const previewWorkflow = await readFile(
	resolve(import.meta.dirname, "../.github/workflows/deploy-worker.yml"),
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
const bootstrapPreview = previewWorkflow.slice(
	previewWorkflow.indexOf("      - name: Bootstrap dedicated preview Worker"),
	previewWorkflow.indexOf("      - name: Upload preview version"),
);
const uploadPreview = previewWorkflow.slice(
	previewWorkflow.indexOf("      - name: Upload preview version"),
	previewWorkflow.indexOf("      - name: Activate preview version"),
);
const cleanupPreview = previewWorkflow.slice(
	previewWorkflow.indexOf(
		"      - name: Replace preview alias with inert Worker",
	),
	previewWorkflow.indexOf("      - name: Activate inert cleanup version"),
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
		const releaseOutputs = calculateReleaseOutputs({
			beforeWorkerManifest: workerManifest("1.0.0"),
			afterWorkerManifest: workerManifest("1.0.1"),
			published: false,
			publishedPackages: [],
		});
		expect(releaseOutputs.worker_released).toBe(true);
		expect(releaseOutputs.worker_version).toBe("1.0.1");
	});

	it("rejects empty and non-semantic Worker versions", () => {
		expect(() => resolveWorkerVersion(workerManifest(""))).toThrow(
			"valid semantic version",
		);
		expect(() => resolveWorkerVersion(workerManifest("release-1"))).toThrow(
			"valid semantic version",
		);
	});

	it("builds deterministic bounded preview prerelease tags", () => {
		const options = {
			manifest: workerManifest("1.2.3"),
			pullRequestNumber: "845",
			headSha: "abcdef1234567890abcdef1234567890abcdef12",
		};

		const first = resolveWorkerPreviewTag(options);
		const second = resolveWorkerPreviewTag(options);

		expect(first).toBe("1.2.3-pr.845.abcdef123456");
		expect(second).toBe(first);
		expect(first.length).toBeLessThanOrEqual(MAX_WORKER_PREVIEW_TAG_LENGTH);
	});

	it("rejects unsafe preview tag inputs and overlong tags", () => {
		expect(() =>
			resolveWorkerPreviewTag({
				manifest: workerManifest("1.2.3"),
				pullRequestNumber: "0",
				headSha: "abcdef1234567890abcdef1234567890abcdef12",
			}),
		).toThrow("pull request number");
		expect(() =>
			resolveWorkerPreviewTag({
				manifest: workerManifest("1.2.3"),
				pullRequestNumber: "845",
				headSha: "not-a-commit",
			}),
		).toThrow("commit SHA");
		expect(() =>
			resolveWorkerPreviewTag({
				manifest: workerManifest(`1.2.3-${"a".repeat(60)}`),
				pullRequestNumber: "845",
				headSha: "abcdef1234567890abcdef1234567890abcdef12",
			}),
		).toThrow("exceeds");
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

	it("tags production and actual preview uploads only", () => {
		expect(workflow).toContain(
			"worker_version: ${{ steps.release.outputs.worker_version }}",
		);
		expect(deployProduction).toContain("WORKER_VERSION:");
		expect(deployProduction).toContain('--tag "$WORKER_VERSION"');
		expect(previewWorkflow).toContain(
			"node scripts/resolve-worker-version.mjs preview",
		);
		expect(uploadPreview).toContain(
			'--tag "${{ steps.worker_version.outputs.tag }}"',
		);
		expect(bootstrapPreview).not.toContain("--tag");
		expect(cleanupPreview).not.toContain("--tag");
	});
});
