import { describe, expect, it } from "vitest";
import { calculateReleaseOutputs } from "./release-outputs.mjs";
import {
	MAX_WORKER_PREVIEW_TAG_LENGTH,
	resolveWorkerPreviewTag,
	resolveWorkerVersion,
} from "./resolve-worker-version.mjs";

const beforeWorkerManifest = JSON.stringify({ version: "1.2.3" });
const afterWorkerManifest = JSON.stringify({ version: "1.2.4" });

describe("resolveWorkerVersion", () => {
	it("accepts only the manifest's exact semantic version", () => {
		expect(resolveWorkerVersion(beforeWorkerManifest)).toBe("1.2.3");
		expect(() => resolveWorkerVersion('{"version":"next"}')).toThrow(
			"valid semantic version",
		);
		expect(() => resolveWorkerVersion("not JSON")).toThrow("valid JSON");
	});

	it("creates a bounded deterministic preview tag", () => {
		const tag = resolveWorkerPreviewTag({
			manifest: beforeWorkerManifest,
			pullRequestNumber: 42,
			headSha: "ABCDEF1234567890",
		});

		expect(tag).toBe("1.2.3-pr.42.abcdef123456");
		expect(tag.length).toBeLessThanOrEqual(MAX_WORKER_PREVIEW_TAG_LENGTH);
	});

	it("rejects unsafe preview identifiers", () => {
		expect(() =>
			resolveWorkerPreviewTag({
				manifest: beforeWorkerManifest,
				pullRequestNumber: 0,
				headSha: "abcdef1",
			}),
		).toThrow("positive pull request number");
		expect(() =>
			resolveWorkerPreviewTag({
				manifest: beforeWorkerManifest,
				pullRequestNumber: 42,
				headSha: "not-a-sha",
			}),
		).toThrow("hexadecimal commit SHA");
	});
});

describe("calculateReleaseOutputs", () => {
	it("reports package and Worker release changes independently", () => {
		expect(
			calculateReleaseOutputs({
				beforeWorkerManifest,
				afterWorkerManifest,
				published: "true",
				publishedPackages: [{ name: "hevy-mcp", version: "5.0.0" }],
				nodePackageName: "hevy-mcp",
			}),
		).toEqual({
			version: "5.0.0",
			released: true,
			node_released: true,
			worker_version: "1.2.4",
			worker_released: true,
		});
	});

	it("does not report an unpublished or unversioned Node package", () => {
		expect(
			calculateReleaseOutputs({
				beforeWorkerManifest,
				afterWorkerManifest: beforeWorkerManifest,
				published: false,
				publishedPackages: [{ name: "hevy-mcp" }],
				nodePackageName: "hevy-mcp",
			}),
		).toMatchObject({
			version: "",
			released: false,
			node_released: false,
			worker_version: "1.2.3",
			worker_released: false,
		});
	});

	it("reports released without a Node version when only other packages publish", () => {
		expect(
			calculateReleaseOutputs({
				beforeWorkerManifest,
				afterWorkerManifest: beforeWorkerManifest,
				published: true,
				publishedPackages: [{ name: "hevy-mcp" }],
				nodePackageName: "hevy-mcp",
			}),
		).toMatchObject({
			version: "",
			released: true,
			node_released: false,
		});
	});
});
