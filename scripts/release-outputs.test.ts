import { describe, expect, it } from "vitest";
import { calculateReleaseOutputs } from "./release-outputs.mjs";
import {
	MAX_WORKER_PREVIEW_TAG_LENGTH,
	resolveWorkerPreviewTag,
	resolveWorkerVersion,
} from "./resolve-worker-version.mjs";

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
				beforeWorkerManifest: workerManifest("1.0.0", "1.0.0"),
				afterWorkerManifest: workerManifest("1.0.0", "2.0.0"),
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
});
