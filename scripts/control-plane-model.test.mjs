import { describe, expect, it } from "vitest";
import {
	loadControlPlane,
	loadControlPlaneBaseline,
	repositoryRoot,
} from "./control-plane-models.mjs";
import {
	validateAggregateAcyclicity,
	validateArtifactProvenance,
	validateBaseline,
	validateControlPlane,
	validateHistoricalRegistryFragments,
	validateTopology,
	validateValidationLanes,
} from "./repository-control-plane.mjs";
import {
	normalizeChangedFiles,
	resolveImpactedLanes,
} from "./control-plane-routing.mjs";

describe("repository control-plane models", () => {
	it("models every workspace identity, role, and dependency direction", () => {
		const controlPlane = validateControlPlane(repositoryRoot);
		const workspaces = Object.fromEntries(
			controlPlane.topology.workspaces.map((workspace) => [
				workspace.id,
				workspace,
			]),
		);

		expect(Object.keys(workspaces)).toEqual([
			"hevy-client",
			"core",
			"node",
			"worker",
			"cli",
		]);
		expect(workspaces["hevy-client"]?.role).toBe("client");
		expect(workspaces.core?.role).toBe("runtime");
		expect(workspaces.node?.role).toBe("server");
		expect(workspaces.worker?.role).toBe("adapter");
		expect(workspaces.cli?.role).toBe("cli");
		expect(workspaces.core?.dependencies).toEqual(["hevy-client"]);
		expect(workspaces.node?.dependencies).toEqual(["hevy-client", "core"]);
		expect(workspaces.worker?.dependencies).toEqual(["hevy-client", "core"]);
		expect(workspaces.cli?.dependencies).toEqual(["hevy-client", "core"]);
	});

	it("keeps artifact provenance declarative and complete", () => {
		const controlPlane = loadControlPlane(repositoryRoot);
		const provenance = controlPlane.provenance;

		expect(provenance.outputs.map((output) => output.id)).toEqual(
			expect.arrayContaining([
				"generated-client",
				"server-manifest",
				"plugin-manifest",
			]),
		);
		expect(provenance.candidates.map((candidate) => candidate.id)).toEqual(
			expect.arrayContaining([
				"node-package",
				"cli-package",
				"worker-bundle",
				"docker-image",
			]),
		);
		for (const entry of [
			...provenance.generators,
			...provenance.outputs,
			...provenance.candidates,
		]) {
			expect(entry).not.toHaveProperty("command");
			expect(entry).not.toHaveProperty("credentials");
		}
		for (const candidate of provenance.candidates) {
			expect(candidate.outputs.length).toBeGreaterThan(0);
			expect(candidate.producers.length).toBeGreaterThan(0);
			expect(candidate.validationTargets.length).toBeGreaterThan(0);
		}
		expect(
			provenance.candidates.find(
				(candidate) => candidate.id === "worker-bundle",
			).sourcePaths,
		).toEqual(
			expect.arrayContaining([
				"packages/worker/**",
				"packages/core/**",
				"packages/hevy-client/**",
				"cloudflare.config.ts",
				"package.json",
				"package-lock.json",
			]),
		);
		expect(
			provenance.candidates.find((candidate) => candidate.id === "docker-image")
				.sourcePaths,
		).toEqual(
			expect.arrayContaining([
				"Dockerfile",
				"package.json",
				"package-lock.json",
				"tsconfig.base.json",
				"tsconfig.json",
				"scripts/install-git-hooks.mjs",
			]),
		);
	});

	it("maps validation lanes to Nx without recursive dispatchers", () => {
		const controlPlane = loadControlPlane(repositoryRoot);
		const unresolved = new Map(
			controlPlane.lanes.unresolvedMappings.map((entry) => [
				entry.id,
				entry.reason,
			]),
		);

		expect(unresolved.size).toBe(0);
		expect(controlPlane.lanes.aggregates["pull-request"]?.nxTarget).toBe(
			"test:pr",
		);
		expect(controlPlane.lanes.aggregates.release?.nxTarget).toBe(
			"release:validate",
		);
		expect(controlPlane.lanes.aggregates.release?.mappingStatus).toBe("mapped");
		expect(controlPlane.lanes.aggregates["pre-push"]?.nxTarget).toBe(
			"pre-push",
		);
		expect(controlPlane.lanes.aggregates["pull-request-ci"]).toMatchObject({
			external: true,
			integration: "github-actions",
			nxTarget: null,
			mappingStatus: "external",
		});
		expect(
			controlPlane.lanes.lanes.find(
				(lane) => lane.id === "repository-control-plane",
			),
		).toMatchObject({
			nxTarget: "check:control-plane",
			mappingStatus: "mapped",
		});
		for (const laneId of ["worker-http", "worker-bundle", "worker-http-live"]) {
			expect(
				controlPlane.lanes.lanes.find((lane) => lane.id === laneId),
			).toMatchObject({ workflowRuntimes: ["node-24"] });
		}
		expect(
			controlPlane.lanes.lanes.find((lane) => lane.id === "generation"),
		).toMatchObject({
			nxTarget: "check:generated",
			mappingStatus: "mapped",
		});
		expect(
			controlPlane.lanes.lanes.find((lane) => lane.id === "release-unit"),
		).toMatchObject({ nxTarget: "test:release-unit", mappingStatus: "mapped" });
		for (const lane of controlPlane.lanes.lanes) {
			expect(lane).not.toHaveProperty("command");
			expect(lane.alias ?? "").not.toContain("run-validation-lane");
		}
	});

	it("rejects malformed references and graph cycles", () => {
		const controlPlane = loadControlPlane(repositoryRoot);
		const artifactIds = new Set([
			...controlPlane.provenance.outputs.map((entry) => entry.id),
			...controlPlane.provenance.candidates.map((entry) => entry.id),
		]);
		const laneIds = new Set(controlPlane.lanes.lanes.map((lane) => lane.id));

		const duplicateTopology = structuredClone(controlPlane.topology);
		duplicateTopology.workspaces.push(
			structuredClone(duplicateTopology.workspaces[0]),
		);
		expect(() =>
			validateTopology(repositoryRoot, duplicateTopology, artifactIds),
		).toThrow(/workspace ids contains duplicates/);

		const missingTopologyReference = structuredClone(controlPlane.topology);
		missingTopologyReference.workspaces[1].dependencies.push("missing");
		expect(() =>
			validateTopology(repositoryRoot, missingTopologyReference, artifactIds),
		).toThrow(/unknown dependency missing/);

		const allowedPolicyVariation = structuredClone(controlPlane.topology);
		allowedPolicyVariation.workspaces[0].runtime = "workerd";
		allowedPolicyVariation.workspaces[0].role = "runtime";
		expect(() =>
			validateTopology(repositoryRoot, allowedPolicyVariation, artifactIds),
		).not.toThrow();

		const invalidPolicyVariation = structuredClone(controlPlane.topology);
		invalidPolicyVariation.workspaces[0].runtime = "unknown-runtime";
		expect(() =>
			validateTopology(repositoryRoot, invalidPolicyVariation, artifactIds),
		).toThrow(/unknown runtime/);

		const nonPublishablePublic = structuredClone(controlPlane.topology);
		nonPublishablePublic.workspaces.find(
			(workspace) => workspace.id === "node",
		).publishable = false;
		expect(() =>
			validateTopology(repositoryRoot, nonPublishablePublic, artifactIds),
		).not.toThrow();

		const privatePublishable = structuredClone(controlPlane.topology);
		privatePublishable.workspaces.find(
			(workspace) => workspace.id === "core",
		).publishable = true;
		expect(() =>
			validateTopology(repositoryRoot, privatePublishable, artifactIds),
		).toThrow(/publishable workspaces must be non-private/);

		const workspaceGlobDrift = structuredClone(controlPlane.topology);
		workspaceGlobDrift.workspaceGlob = "packages/**";
		expect(() =>
			validateTopology(repositoryRoot, workspaceGlobDrift, artifactIds),
		).toThrow(/root package workspaces must match topology workspaceGlob/);

		const malformedRuntimeMatrix = structuredClone(controlPlane.lanes);
		malformedRuntimeMatrix.runtimeMatrix["node-24"].version = "";
		expect(() =>
			validateValidationLanes(
				repositoryRoot,
				malformedRuntimeMatrix,
				controlPlane.topology,
				controlPlane.provenance,
			),
		).toThrow(/node-24.version is required/);

		const malformedWorkflowRuntime = structuredClone(controlPlane.lanes);
		malformedWorkflowRuntime.lanes.find(
			(lane) => lane.id === "worker-http",
		).workflowRuntimes = ["missing-runtime"];
		expect(() =>
			validateValidationLanes(
				repositoryRoot,
				malformedWorkflowRuntime,
				controlPlane.topology,
				controlPlane.provenance,
			),
		).toThrow(/unknown workflow runtime missing-runtime/);

		const emptyOutputOwners = structuredClone(controlPlane.provenance);
		emptyOutputOwners.outputs[0].owners = [];
		expect(() =>
			validateArtifactProvenance(
				emptyOutputOwners,
				controlPlane.topology,
				laneIds,
			),
		).toThrow(/owners must not be empty/);

		const mappedAggregateWithUnresolvedLane = structuredClone(
			controlPlane.lanes,
		);
		const unresolvedReleaseUnit = mappedAggregateWithUnresolvedLane.lanes.find(
			(lane) => lane.id === "release-unit",
		);
		unresolvedReleaseUnit.mappingStatus = "unresolved";
		unresolvedReleaseUnit.nxTarget = null;
		unresolvedReleaseUnit.mappingReason = "test fixture";
		mappedAggregateWithUnresolvedLane.unresolvedMappings.push({
			id: "release-unit",
			reason: "test fixture",
		});
		mappedAggregateWithUnresolvedLane.aggregates["pull-request"].lanes.push(
			"release-unit",
		);
		expect(() =>
			validateValidationLanes(
				repositoryRoot,
				mappedAggregateWithUnresolvedLane,
				controlPlane.topology,
				controlPlane.provenance,
			),
		).toThrow(/pull-request mapped aggregate includes an unresolved member/);

		const mappedNestedAggregateWithUnresolvedLane = structuredClone(
			controlPlane.lanes,
		);
		const nestedUnresolvedReleaseUnit =
			mappedNestedAggregateWithUnresolvedLane.lanes.find(
				(lane) => lane.id === "release-unit",
			);
		nestedUnresolvedReleaseUnit.mappingStatus = "unresolved";
		nestedUnresolvedReleaseUnit.nxTarget = null;
		nestedUnresolvedReleaseUnit.mappingReason = "test fixture";
		mappedNestedAggregateWithUnresolvedLane.unresolvedMappings.push({
			id: "release-unit",
			reason: "test fixture",
		});
		mappedNestedAggregateWithUnresolvedLane.aggregates.nested = {
			lanes: ["release-unit"],
			nxTarget: "test:pr",
			mappingStatus: "mapped",
		};
		mappedNestedAggregateWithUnresolvedLane.aggregates[
			"pull-request"
		].lanes.push("nested");
		expect(() =>
			validateValidationLanes(
				repositoryRoot,
				mappedNestedAggregateWithUnresolvedLane,
				controlPlane.topology,
				controlPlane.provenance,
			),
		).toThrow(/pull-request mapped aggregate includes an unresolved member/);

		const duplicateReleaseTrigger = structuredClone(controlPlane.topology);
		duplicateReleaseTrigger.release.triggers.push(
			structuredClone(duplicateReleaseTrigger.release.triggers[0]),
		);
		expect(() =>
			validateTopology(repositoryRoot, duplicateReleaseTrigger, artifactIds),
		).toThrow(/release trigger paths contains duplicates/);

		const missingArtifactReference = structuredClone(controlPlane.lanes);
		missingArtifactReference.lanes[0].artifacts.push("missing-artifact");
		expect(() =>
			validateValidationLanes(
				repositoryRoot,
				missingArtifactReference,
				controlPlane.topology,
				controlPlane.provenance,
			),
		).toThrow(/unknown artifact missing-artifact/);

		const outputOwnedByAnotherLane = structuredClone(controlPlane.lanes);
		outputOwnedByAnotherLane.lanes
			.find((lane) => lane.id === "unit")
			.artifacts.push("cli-dist");
		expect(() =>
			validateValidationLanes(
				repositoryRoot,
				outputOwnedByAnotherLane,
				controlPlane.topology,
				controlPlane.provenance,
			),
		).toThrow(/unit references output it does not own: cli-dist/);

		const missingCandidateLaneLink = structuredClone(controlPlane.lanes);
		missingCandidateLaneLink.lanes.find(
			(lane) => lane.id === "generation",
		).artifacts = [];
		expect(() =>
			validateValidationLanes(
				repositoryRoot,
				missingCandidateLaneLink,
				controlPlane.topology,
				controlPlane.provenance,
			),
		).toThrow(
			/hevy-client-package validation lane does not reference the candidate or an output: generation/,
		);

		const missingNxMapping = structuredClone(controlPlane.lanes);
		missingNxMapping.lanes[0].nxTarget = "missing-target";
		expect(() =>
			validateValidationLanes(
				repositoryRoot,
				missingNxMapping,
				controlPlane.topology,
				controlPlane.provenance,
			),
		).toThrow(/missing Nx target missing-target/);

		const missingLaneReference = structuredClone(controlPlane.provenance);
		missingLaneReference.candidates[0].validation.push("missing-lane");
		expect(() =>
			validateArtifactProvenance(
				missingLaneReference,
				controlPlane.topology,
				laneIds,
			),
		).toThrow(/unknown lane missing-lane/);

		const missingProducerTarget = structuredClone(controlPlane.provenance);
		missingProducerTarget.outputs[0].producers[0].target = "missing-target";
		expect(() =>
			validateArtifactProvenance(
				missingProducerTarget,
				controlPlane.topology,
				laneIds,
				repositoryRoot,
			),
		).toThrow(/missing producer or validation target missing-target/);

		const unlinkedCandidateOutput = structuredClone(controlPlane.provenance);
		unlinkedCandidateOutput.candidates[0].outputs.push("missing-output");
		expect(() =>
			validateArtifactProvenance(
				unlinkedCandidateOutput,
				controlPlane.topology,
				laneIds,
				repositoryRoot,
			),
		).toThrow(/references unknown output missing-output/);

		const outputPathDrift = structuredClone(controlPlane.provenance);
		outputPathDrift.outputs.find(
			(output) => output.id === "generated-client",
		).paths = ["packages/hevy-client/src/wrong-output/**"];
		expect(() =>
			validateArtifactProvenance(
				outputPathDrift,
				controlPlane.topology,
				laneIds,
				repositoryRoot,
			),
		).toThrow(/does not match producer target output build:client/);

		const tarballOutputGlob = structuredClone(controlPlane.provenance);
		tarballOutputGlob.outputs.find(
			(output) => output.id === "node-package-tarball",
		).paths = [".nx/pack/hevy-mcp-1.2.3.tgz"];
		expect(() =>
			validateArtifactProvenance(
				tarballOutputGlob,
				controlPlane.topology,
				laneIds,
				repositoryRoot,
			),
		).not.toThrow();

		const workerCoverageDrift = structuredClone(controlPlane.provenance);
		workerCoverageDrift.candidates.find(
			(candidate) => candidate.id === "worker-bundle",
		).sourcePaths = ["packages/worker/**"];
		expect(() =>
			validateArtifactProvenance(
				workerCoverageDrift,
				controlPlane.topology,
				laneIds,
				repositoryRoot,
			),
		).toThrow(/worker-bundle source coverage is missing packages\/core/);

		const dockerCoverageDrift = structuredClone(controlPlane.provenance);
		dockerCoverageDrift.candidates.find(
			(candidate) => candidate.id === "docker-image",
		).sourcePaths = ["Dockerfile"];
		expect(() =>
			validateArtifactProvenance(
				dockerCoverageDrift,
				controlPlane.topology,
				laneIds,
				repositoryRoot,
			),
		).toThrow(/docker-image source coverage is missing package.json/);

		const publicationTarget = structuredClone(controlPlane.lanes);
		publicationTarget.aggregates.release.nxTarget = "release";
		expect(() =>
			validateValidationLanes(
				repositoryRoot,
				publicationTarget,
				controlPlane.topology,
				controlPlane.provenance,
			),
		).toThrow(/mapped target must not invoke changeset publish/);

		const aggregateWorkflowRuntimeDrift = structuredClone(controlPlane.lanes);
		aggregateWorkflowRuntimeDrift.aggregates.release.workflowRuntimes.build = [
			"missing-runtime",
		];
		expect(() =>
			validateValidationLanes(
				repositoryRoot,
				aggregateWorkflowRuntimeDrift,
				controlPlane.topology,
				controlPlane.provenance,
			),
		).toThrow(/workflowRuntimes\.build references an unknown runtime/);

		const aggregateWorkflowLaneDrift = structuredClone(controlPlane.lanes);
		aggregateWorkflowLaneDrift.aggregates.release.workflowRuntimes.unit = [
			"node-24",
		];
		expect(() =>
			validateValidationLanes(
				repositoryRoot,
				aggregateWorkflowLaneDrift,
				controlPlane.topology,
				controlPlane.provenance,
			),
		).toThrow(/workflowRuntimes references a lane outside the aggregate/);

		const externalAggregateWithUnresolvedLane = structuredClone(
			controlPlane.lanes,
		);
		const unresolvedWorkerHttp = externalAggregateWithUnresolvedLane.lanes.find(
			(lane) => lane.id === "worker-http",
		);
		unresolvedWorkerHttp.mappingStatus = "unresolved";
		unresolvedWorkerHttp.nxTarget = null;
		unresolvedWorkerHttp.mappingReason = "test fixture";
		externalAggregateWithUnresolvedLane.unresolvedMappings.push({
			id: "worker-http",
			reason: "test fixture",
		});
		externalAggregateWithUnresolvedLane.aggregates[
			"pull-request-ci"
		].lanes.push("worker-http");
		expect(() =>
			validateValidationLanes(
				repositoryRoot,
				externalAggregateWithUnresolvedLane,
				controlPlane.topology,
				controlPlane.provenance,
			),
		).toThrow(/external aggregate includes an unresolved member/);

		expect(() =>
			validateAggregateAcyclicity({
				first: { lanes: ["second"] },
				second: { lanes: ["first"] },
			}),
		).toThrow(/Validation aggregate cycle/);
	});

	it("detects baseline identity drift and routes changed files", () => {
		const controlPlane = loadControlPlane(repositoryRoot);
		validateBaseline(repositoryRoot, controlPlane);
		const baseline = loadControlPlaneBaseline(repositoryRoot);
		expect(() => validateHistoricalRegistryFragments([])).toThrow(
			/drifted from canonical evidence/,
		);
		const tamperedFragments = structuredClone(
			baseline.before.registryFragments,
		);
		tamperedFragments[0].id = "tampered-id";
		expect(() =>
			validateHistoricalRegistryFragments(tamperedFragments),
		).toThrow(/drifted from canonical evidence/);
		const alteredCoordinateFragments = structuredClone(
			baseline.before.registryFragments,
		);
		alteredCoordinateFragments[0].line += 1;
		expect(() =>
			validateHistoricalRegistryFragments(alteredCoordinateFragments),
		).toThrow(/drifted from canonical evidence/);
		const alteredHistoricalAggregate = structuredClone(baseline);
		alteredHistoricalAggregate.before.metrics.aggregateLaneIdentities[
			"pull-request"
		][0] = "unit-drift";
		expect(() =>
			validateBaseline(
				repositoryRoot,
				controlPlane,
				alteredHistoricalAggregate,
			),
		).toThrow(/baseline historical aggregate pull-request drifted/);
		const extraCurrentAggregate = structuredClone(baseline);
		extraCurrentAggregate.after.metrics.aggregateLaneIdentities.extra = [];
		expect(() =>
			validateBaseline(repositoryRoot, controlPlane, extraCurrentAggregate),
		).toThrow(/baseline current aggregate identities drifted/);
		const missingCurrentAggregateCount = structuredClone(baseline);
		delete missingCurrentAggregateCount.comparableMetrics
			.currentModeledAggregateLaneCounts["pull-request-ci"];
		expect(() =>
			validateBaseline(
				repositoryRoot,
				controlPlane,
				missingCurrentAggregateCount,
			),
		).toThrow(/baseline current aggregate counts drifted/);

		const drifted = structuredClone(controlPlane);
		drifted.lanes.lanes[0].id = "unit-drift";
		expect(() => validateBaseline(repositoryRoot, drifted)).toThrow(
			/baseline validation lane identities drifted/,
		);

		expect(
			normalizeChangedFiles([
				{ oldPath: "old.txt", newPath: "new.txt" },
				"old\\nested.txt",
				"old.txt",
			]),
		).toEqual(["old.txt", "new.txt", "old/nested.txt"]);
		const impacted = resolveImpactedLanes(controlPlane.lanes, [
			"packages/hevy-client/src/generated/client.ts",
			"packages/node/src/index.ts",
			"packages/core/src/index.ts",
			"Dockerfile",
			"server.json",
			"plugin.json",
			"tests/integration/live.test.ts",
			"tests/nightly/diagnostics.test.mjs",
			{
				oldPath: "packages/node/src/old.ts",
				newPath: "packages/node/src/new.ts",
			},
		]);
		expect(impacted).toEqual(
			expect.arrayContaining([
				"generation",
				"diagnostics",
				"docker",
				"pack",
				"server-manifest",
				"integration-live",
				"release-integration",
				"nightly",
				"check",
			]),
		);
	});
});
