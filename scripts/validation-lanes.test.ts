import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	loadControlPlane,
	loadValidationLanes,
	loadArtifactProvenance,
	loadTopology,
	releaseConsumers,
	relativePath,
	validateAggregateAcyclicity,
	validateGeneratorCommands,
	validateValidationLaneDispatcher,
	workspaceById,
	workspaceByName,
} from "./repository-control-plane.mjs";
import { validateHistoricalRegistryFragments } from "./control-plane-baseline.mjs";
import {
	laneCommand,
	main,
	requiredCredentials,
	runMember,
} from "./run-validation-lane.mjs";
import {
	checkRenderedValidationLaneTables,
	renderValidationLaneTable,
	renderValidationLaneTables,
	replaceValidationLaneTable,
	validationLaneTableEnd,
	validationLaneTableStart,
} from "./render-validation-lanes.mjs";

describe("validation lane control plane", () => {
	it("keeps the release suite inclusive of performance tests", async () => {
		const manifest = loadValidationLanes();
		const releaseUnit = manifest.lanes.find(
			(lane) => lane.id === "release-unit",
		);
		if (!releaseUnit?.alias) throw new Error("release-unit lane is missing");
		const packageJson = JSON.parse(await readFile("package.json", "utf8"));

		expect(releaseUnit?.selector.exclude).toEqual(["tests/integration/**"]);
		expect(releaseUnit?.selector.exclude).not.toContain("tests/performance/**");
		expect(packageJson.scripts[releaseUnit.alias]).toBe(
			"node scripts/run-validation-lane.mjs --execute release-unit",
		);
		expect(releaseUnit.command).toEqual({
			kind: "argv",
			executable: "vitest",
			args: ["run", "--exclude", "tests/integration/**"],
		});
	});

	it("keeps public aliases as exact non-recursive lane delegates", async () => {
		const manifest = loadValidationLanes();
		const packageJson = JSON.parse(await readFile("package.json", "utf8"));
		for (const lane of manifest.lanes) {
			if (lane.external || !lane.alias) continue;
			expect(packageJson.scripts[lane.alias]).toBe(
				`node scripts/run-validation-lane.mjs --execute ${lane.id}`,
			);
			expect(JSON.stringify(lane.command)).not.toContain(
				"run-validation-lane.mjs",
			);
		}
	});

	it("rejects a validate:lane no-op dispatcher", () => {
		expect(() =>
			validateValidationLaneDispatcher({
				scripts: { "validate:lane": "true" },
			}),
		).toThrow("validate:lane must delegate exactly");
	});

	it("rejects drifted generator scripts", async () => {
		const provenance = loadArtifactProvenance();
		const packageJson = JSON.parse(await readFile("package.json", "utf8"));
		packageJson.scripts["build:client"] = "true";
		expect(() => validateGeneratorCommands(provenance, packageJson)).toThrow(
			"build:client script drifted",
		);
	});

	it("rejects duplicate historical registry fragment ids", () => {
		const fragment = {
			id: "duplicate",
			path: "scripts/check-workspaces.mjs",
			symbol: "expected",
			sourceRevision: "f2e7af0ee3a02b6a0c6fa7820895db3882b7be4c",
			line: 5,
		};
		expect(() =>
			validateHistoricalRegistryFragments([fragment, { ...fragment }]),
		).toThrow("ids contains duplicates");
	});

	it("rejects duplicate historical registry coordinates", () => {
		const fragment = {
			id: "coordinate-a",
			path: "scripts/check-workspaces.mjs",
			symbol: "expected",
			sourceRevision: "f2e7af0ee3a02b6a0c6fa7820895db3882b7be4c",
			line: 5,
		};
		expect(() =>
			validateHistoricalRegistryFragments([
				fragment,
				{ ...fragment, id: "coordinate-b" },
			]),
		).toThrow("coordinates contains duplicates");
	});

	it("rejects generic historical registry symbols", () => {
		expect(() =>
			validateHistoricalRegistryFragments([
				{
					id: "generic",
					path: "scripts/check-workspaces.mjs",
					symbol: "const",
					sourceRevision: "f2e7af0ee3a02b6a0c6fa7820895db3882b7be4c",
					line: 5,
				},
			]),
		).toThrow("does not match a declaration");
	});

	it("preflights all nightly launcher ownership variables", async () => {
		const nightly = loadValidationLanes().lanes.find(
			(lane) => lane.id === "nightly",
		);
		if (!nightly) throw new Error("nightly lane is missing");
		expect(requiredCredentials(nightly, {})).toEqual([
			"HEVY_API_KEY",
			"HEVY_MCP_COMMAND",
			"HEVY_MCP_ARGS_JSON",
		]);

		await expect(main(["nightly"])).rejects.toThrow(
			"HEVY_API_KEY, HEVY_MCP_COMMAND, HEVY_MCP_ARGS_JSON",
		);
	});

	it("rejects aggregate cycles during model validation", () => {
		expect(() =>
			validateAggregateAcyclicity({
				alpha: { lanes: ["beta"] },
				beta: { lanes: ["alpha"] },
			}),
		).toThrow("Validation aggregate cycle: alpha -> beta -> alpha");
	});

	it("renders external integrations without advertising npm aliases", () => {
		const table = renderValidationLaneTable();
		expect(table).toContain("`docker`");
		expect(table).toContain("external: docker workflow");
		expect(table).toContain("`generation`");
		expect(table).toContain("external: issue-870");
		expect(table).not.toContain("npm run undefined");
		expect(table).toContain("HEVY_MCP_COMMAND, HEVY_MCP_ARGS_JSON");
	});

	it("normalizes lane commands and reports dispatcher errors", async () => {
		expect(
			laneCommand(
				{
					id: "argv",
					command: { kind: "argv", executable: "node", args: ["--version"] },
				},
				["--trace-warnings"],
			),
		).toEqual([{ command: "node", args: ["--version", "--trace-warnings"] }]);
		const sequence = {
			id: "sequence",
			command: {
				kind: "sequence" as const,
				commands: [
					{ executable: "node", args: ["--version"] },
					{ executable: "node", args: ["--help"] },
				],
			},
		};
		expect(laneCommand(sequence)).toEqual([
			{ command: "node", args: ["--version"] },
			{ command: "node", args: ["--help"] },
		]);
		expect(laneCommand(sequence, ["--trace-warnings"])).toEqual([
			{ command: "node", args: ["--version"] },
			{ command: "node", args: ["--help", "--trace-warnings"] },
		]);
		expect(() =>
			laneCommand({ id: "docker", external: true, integration: "docker" }),
		).toThrow("docker is an external validation hook (docker)");
		expect(() => laneCommand({ id: "broken" })).toThrow(
			"broken has no executable manifest command",
		);
		await expect(main([])).rejects.toThrow("Usage: run-validation-lane.mjs");
		await expect(runMember("missing-lane", [])).rejects.toThrow(
			"Unknown validation lane or aggregate missing-lane",
		);
		await expect(
			runMember("pull-request", [], ["pull-request"]),
		).rejects.toThrow(
			"Validation aggregate cycle: pull-request -> pull-request",
		);
	});

	it("loads model helpers and traverses release consumers", async () => {
		const missingRoot = await mkdtemp(
			join(tmpdir(), "hevy-mcp-model-missing-"),
		);
		expect(() => loadTopology(missingRoot)).toThrow(
			"repository/topology.json is required",
		);
		expect(() => loadArtifactProvenance(missingRoot)).toThrow(
			"repository/artifact-provenance.json is required",
		);
		expect(() => loadValidationLanes(missingRoot)).toThrow(
			"repository/validation-lanes.json is required",
		);

		const controlPlane = loadControlPlane();
		const topology = controlPlane.topology;
		expect(controlPlane.rootDir).toBeDefined();
		expect(controlPlane.provenance).toEqual(loadArtifactProvenance());
		expect(controlPlane.lanes).toEqual(loadValidationLanes());
		expect(workspaceById(topology, "core").name).toBe("@hevy-mcp/core");
		expect(workspaceByName(topology, "hevy-mcp").id).toBe("node");
		expect(releaseConsumers(topology, "hevy-client")).toEqual([
			"core",
			"node",
			"worker",
			"cli",
		]);
		expect(releaseConsumers(topology, "unknown")).toEqual([]);
		expect(
			relativePath(
				controlPlane.rootDir,
				join(controlPlane.rootDir, "packages", "core"),
			),
		).toBe("packages/core");
		expect(() => workspaceById(topology, "unknown")).toThrow(
			"Unknown workspace id unknown",
		);
		expect(() => workspaceByName(topology, "@scope/unknown")).toThrow(
			"Unknown workspace package @scope/unknown",
		);
	});

	it("replaces and verifies rendered lane tables", async () => {
		const manifest = {
			lanes: [
				{
					id: "custom",
					alias: "custom",
					gate: "required",
					runtimes: [],
					credentials: [],
					artifacts: [],
					selector: {
						kind: "check",
						include: ["src/**"],
						exclude: ["src/generated/**"],
						config: "custom.config.ts",
						workspace: "core",
						check: "custom",
					},
				},
			],
		};
		const table = renderValidationLaneTable(manifest);
		expect(table).toContain("include: src/**");
		expect(table).toContain("exclude: src/generated/**");
		expect(table).toContain("config: custom.config.ts");
		expect(table).toContain("workspace: core");
		expect(table).toContain("check: custom");
		const contents = `before\n${validationLaneTableStart}\nstale\n${validationLaneTableEnd}\nafter`;
		expect(replaceValidationLaneTable(contents, table)).toBe(
			`before\n${table}\nafter`,
		);
		expect(() => replaceValidationLaneTable("missing markers", table)).toThrow(
			"Validation lane table markers are missing or out of order",
		);
		expect(() =>
			replaceValidationLaneTable(
				`${validationLaneTableEnd}\n${validationLaneTableStart}`,
				table,
			),
		).toThrow("Validation lane table markers are missing or out of order");

		const root = await mkdtemp(join(tmpdir(), "hevy-mcp-render-"));
		await mkdir(join(root, "repository"), { recursive: true });
		await writeFile(
			join(root, "repository", "validation-lanes.json"),
			JSON.stringify({ lanes: [] }),
		);
		for (const file of ["CONTRIBUTING.md", "docs/test-lanes.md"]) {
			await mkdir(join(root, "docs"), { recursive: true });
			await writeFile(
				join(root, file),
				`${validationLaneTableStart}\nstale\n${validationLaneTableEnd}`,
			);
		}
		await expect(checkRenderedValidationLaneTables(root)).rejects.toThrow(
			"CONTRIBUTING.md validation lane table is stale",
		);
		await renderValidationLaneTables(root);
		await expect(
			checkRenderedValidationLaneTables(root),
		).resolves.toBeUndefined();
		expect(await readFile(join(root, "docs/test-lanes.md"), "utf8")).toContain(
			renderValidationLaneTable({ lanes: [] }),
		);
	});
});
