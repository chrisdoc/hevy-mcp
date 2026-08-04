import { describe, expect, it } from "vitest";
import {
	loadControlPlane,
	normalizeChangedFiles,
	resolveImpactedLanes,
	validateControlPlane,
} from "./repository-control-plane.mjs";

describe("repository control plane", () => {
	it("validates all three linked models and their package projections", () => {
		const controlPlane = validateControlPlane();
		expect(controlPlane.topology.workspaces).toHaveLength(5);
		expect(controlPlane.provenance.candidates).toContainEqual(
			expect.objectContaining({ id: "cli-package", workspace: "cli" }),
		);
		expect(controlPlane.lanes.aggregates["pull-request"].lanes).toContain(
			"pack-cli",
		);
	});

	it.each([
		["root file", ["package.json"], ["check"]],
		[
			"nested core file",
			["packages/core/src/tools/routines.ts"],
			["unit", "contract", "package-boundaries"],
		],
		[
			"nested Worker file",
			["packages/worker/src/worker.ts"],
			["worker", "worker-bundle"],
		],
	])(
		"routes %s through canonical lane identities",
		(_label, files, expected) => {
			const lanes = loadControlPlane().lanes;
			expect(resolveImpactedLanes(lanes, files)).toEqual(
				expect.arrayContaining(expected),
			);
		},
	);

	it("routes both sides of renames and the path of deletions", () => {
		const lanes = loadControlPlane().lanes;
		const files = normalizeChangedFiles([
			{
				status: "R100",
				oldPath: "packages/core/src/old.ts",
				newPath: "packages/core/src/new.ts",
			},
			{ status: "D", path: "packages/worker/src/removed.ts" },
		]);
		expect(files).toEqual(
			expect.arrayContaining([
				"packages/core/src/old.ts",
				"packages/core/src/new.ts",
				"packages/worker/src/removed.ts",
			]),
		);
		const impacted = resolveImpactedLanes(lanes, files);
		expect(impacted).toEqual(
			expect.arrayContaining(["unit", "worker", "package-changesets"]),
		);
	});
});
