import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	candidateTarballFilename,
	releaseCandidateArtifact,
} from "./release-candidate-artifacts.mjs";

describe("release candidate artifacts", () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
		);
	});

	it("uses npm's deterministic tarball name for scoped packages", () => {
		expect(
			candidateTarballFilename({
				name: "@chrisdoc/hevy-cli",
				version: "1.2.3",
			}),
		).toBe("chrisdoc-hevy-cli-1.2.3.tgz");
		expect(
			candidateTarballFilename({ name: "hevy-mcp", version: "6.0.0" }),
		).toBe("hevy-mcp-6.0.0.tgz");
	});

	it("resolves and verifies the exact package candidate", async () => {
		const root = await mkdtemp(join(tmpdir(), "hevy-release-candidate-"));
		roots.push(root);
		await mkdir(join(root, "packages/example"), { recursive: true });
		await mkdir(join(root, ".nx/pack"), { recursive: true });
		await writeFile(
			join(root, "packages/example/package.json"),
			JSON.stringify({ name: "@scope/example", version: "2.0.0" }),
		);
		await writeFile(join(root, ".nx/pack/scope-example-2.0.0.tgz"), "data");

		await expect(
			releaseCandidateArtifact("packages/example", { repositoryRoot: root }),
		).resolves.toMatchObject({
			name: "@scope/example",
			version: "2.0.0",
			path: join(root, ".nx/pack/scope-example-2.0.0.tgz"),
		});
	});

	it("fails closed when the exact candidate is missing", async () => {
		const root = await mkdtemp(join(tmpdir(), "hevy-release-candidate-"));
		roots.push(root);
		await mkdir(join(root, "packages/example"), { recursive: true });
		await writeFile(
			join(root, "packages/example/package.json"),
			JSON.stringify({ name: "example", version: "1.0.0" }),
		);

		await expect(
			releaseCandidateArtifact("packages/example", { repositoryRoot: root }),
		).rejects.toThrow(/Release candidate is missing or empty/);
	});
});
