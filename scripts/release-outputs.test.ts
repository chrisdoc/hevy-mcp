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
const releaseJob = workflow.slice(
	workflow.indexOf("  release:"),
	workflow.indexOf("  publish-container:"),
);
const publishPreview = workflow.slice(workflow.indexOf("  publish-preview:"));
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
const validateReleaseCandidates = workflow.slice(
	workflow.indexOf("      - name: Validate release candidates"),
	workflow.indexOf("      - name: Run integration tests"),
);
const buildReleasePackage = workflow.slice(
	workflow.indexOf("      - name: Build release package"),
	workflow.indexOf("      - name: Prepare shared package candidates"),
);
const prepareReleaseCandidates = workflow.slice(
	workflow.indexOf("      - name: Prepare shared package candidates"),
	workflow.indexOf("      - name: Validate release candidates"),
);
function workerManifest(version: string, dependency = "1.0.0") {
	return JSON.stringify({
		name: "@hevy-mcp/worker",
		version,
		dependencies: { example: dependency },
	});
}

describe("release outputs", () => {
	it("detects Worker releases from the versioned private manifest", () => {
		expect(
			calculateReleaseOutputs({
				beforeWorkerManifest: workerManifest("1.0.0"),
				afterWorkerManifest: workerManifest("1.0.0"),
				published: false,
				publishedPackages: [],
			}),
		).toMatchObject({
			worker_released: false,
		});

		const releaseOutputs = calculateReleaseOutputs({
			beforeWorkerManifest: workerManifest("1.0.0"),
			afterWorkerManifest: workerManifest("1.0.1"),
			published: false,
			publishedPackages: [],
		});
		expect(releaseOutputs.worker_released).toBe(true);
		expect(releaseOutputs.worker_version).toBe("1.0.1");
	});

	it("uses the canonical Node workspace identity for publication gating", () => {
		const outputs = calculateReleaseOutputs({
			beforeWorkerManifest: workerManifest("1.0.0"),
			afterWorkerManifest: workerManifest("1.0.0"),
			published: true,
			publishedPackages: [{ name: "custom-node", version: "5.0.5" }],
			nodePackageName: "custom-node",
		});

		expect(outputs).toMatchObject({
			node_released: true,
			version: "5.0.5",
		});
	});

	it("rejects empty and non-semantic Worker versions", () => {
		expect(() => resolveWorkerVersion(workerManifest(""))).toThrow(
			"valid semantic version",
		);
		expect(() => resolveWorkerVersion(workerManifest("release-1"))).toThrow(
			"valid semantic version",
		);
		expect(() =>
			calculateReleaseOutputs({
				beforeWorkerManifest: workerManifest("release-1"),
				afterWorkerManifest: workerManifest("1.0.0"),
				published: false,
				publishedPackages: [],
			}),
		).toThrow("valid semantic version");
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

	it("installs mise before release and preview package commands", () => {
		for (const job of [releaseJob, publishPreview]) {
			expect(job).toContain(
				"uses: jdx/mise-action@7e36c90d9ab29c415a2384db3006f3ec8a8cc654",
			);
			expect(job.indexOf("Set up mise")).toBeLessThan(job.indexOf("npm ci"));
		}
	});

	it("gates production deployment on the Worker release", () => {
		expect(deployProduction).toContain(
			"needs.release.outputs.worker_released == 'true'",
		);
	});

	it("scopes release secrets to the release build", () => {
		expect(buildReleasePackage).toContain('HEVY_MCP_RELEASE: "true"');
		expect(buildReleasePackage).toContain(
			"SENTRY_ORG: ${{ secrets.SENTRY_ORG }}",
		);
		expect(buildReleasePackage).toContain(
			"SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}",
		);
		expect(buildReleasePackage).toContain(
			"SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}",
		);
		expect(buildReleasePackage).toContain(
			"OTEL_COLLECTOR_TOKEN: ${{ secrets.OTEL_COLLECTOR_TOKEN }}",
		);
		expect(prepareReleaseCandidates).not.toContain("secrets.");
		expect(prepareReleaseCandidates).toContain(
			"npx nx run @chrisdoc/hevy-cli:build",
		);
		expect(prepareReleaseCandidates).toContain(
			"npx nx run repository:pack:artifacts --excludeTaskDependencies",
		);
		expect(validateReleaseCandidates).not.toContain("secrets.");
		expect(validateReleaseCandidates).toContain(
			"--targets=test:release-unit,test:worker,test:pack,test:cli,test:pack:cli,check:publint",
		);
		expect(validateReleaseCandidates).toContain("--excludeTaskDependencies");
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
			"WORKER_VERSION_TAG: ${{ steps.worker_version.outputs.tag }}",
		);
		expect(uploadPreview).toContain('--tag "${WORKER_VERSION_TAG}"');
		expect(uploadPreview).not.toContain('--tag "${{');
		expect(bootstrapPreview).not.toContain("--tag");
		expect(cleanupPreview).not.toContain("--tag");
	});
});
