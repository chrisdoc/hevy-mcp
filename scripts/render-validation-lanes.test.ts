import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	checkRenderedValidationLaneTables,
	isDirectInvocation,
	renderValidationAggregateTable,
	renderValidationLaneTable,
	renderValidationLaneTables,
	replaceValidationLaneTable,
	validationLaneTableEnd,
	validationLaneTableStart,
} from "./render-validation-lanes.mjs";
import type { ValidationLanesForDocs } from "./render-validation-lanes.mjs";

function fixtureManifest(): ValidationLanesForDocs {
	return {
		version: 1,
		lanes: [
			{
				id: "unit",
				alias: "test:unit",
				nxTarget: "test:unit",
				mappingStatus: "mapped",
				selector: { kind: "vitest", exclude: ["tests/integration/**"] },
				gate: "blocking",
				runtimes: ["node-24"],
				credentials: [],
				artifacts: [],
			},
			{
				id: "check",
				nxTarget: "check",
				mappingStatus: "mapped",
				selector: { kind: "repository-check" },
				gate: "blocking",
				runtimes: ["node-24"],
				credentials: [],
				artifacts: [],
			},
			{
				id: "docker",
				external: true,
				integration: "docker workflow",
				nxTarget: null,
				mappingStatus: "external",
				selector: { kind: "docker-smoke" },
				gate: "blocking",
				runtimes: ["node-24"],
				credentials: [],
				artifacts: [],
			},
		],
		aggregates: {
			"pull-request": {
				lanes: ["unit", "check"],
				nxTarget: "test:pr",
				mappingStatus: "mapped",
			},
		},
	};
}

async function writeFixture(root: string, manifest: unknown, contents: string) {
	await mkdir(join(root, "repository"), { recursive: true });
	await mkdir(join(root, "docs"), { recursive: true });
	await writeFile(
		join(root, "repository", "validation-lanes.json"),
		JSON.stringify(manifest),
	);
	for (const file of ["CONTRIBUTING.md", "docs/test-lanes.md"])
		await writeFile(join(root, file), contents);
}

describe("validation lane documentation projection", () => {
	it("derives aliases, Nx targets, and external integrations without model commands", () => {
		const table = renderValidationLaneTable(fixtureManifest());

		expect(table).toContain("npm run test:unit (Nx: repository:test:unit)");
		expect(table).toContain("npx nx run repository:check");
		expect(table).toContain("external: docker workflow");
		expect(table).toContain("npx nx run repository:test:pr");
		expect(table).toContain("| Count");
		expect(table).not.toContain("npm run undefined");
	});

	it("fails closed for command-bearing or malformed model entries", () => {
		const commandManifest = fixtureManifest();
		(commandManifest.lanes[0] as { command?: string }).command = "vitest";
		expect(() => renderValidationLaneTable(commandManifest)).toThrow(
			"must not encode dispatcher commands",
		);

		const missingAggregateMember = fixtureManifest();
		missingAggregateMember.aggregates["pull-request"].lanes.push("missing");
		expect(() =>
			renderValidationAggregateTable(missingAggregateMember),
		).toThrow("references unknown lane or aggregate missing");

		const aggregateCycle = fixtureManifest();
		aggregateCycle.aggregates.nested = {
			lanes: ["pull-request"],
			nxTarget: "nested",
			mappingStatus: "mapped",
		};
		aggregateCycle.aggregates["pull-request"].lanes.push("nested");
		expect(() => renderValidationLaneTable(aggregateCycle)).toThrow(
			"Validation aggregate cycle",
		);
	});

	it("detects missing, extra, and reordered aliases or aggregates in check mode", async () => {
		const root = await mkdtemp(join(tmpdir(), "hevy-mcp-render-"));
		const manifest = fixtureManifest();
		const marked = `${validationLaneTableStart}\nstale\n${validationLaneTableEnd}`;
		await writeFixture(root, manifest, marked);
		await renderValidationLaneTables(root);
		await expect(
			checkRenderedValidationLaneTables(root),
		).resolves.toBeUndefined();

		const rendered = await readFile(join(root, "docs/test-lanes.md"), "utf8");
		expect(rendered).toContain(validationLaneTableStart);
		expect(rendered).toContain(validationLaneTableEnd);

		const missingAlias = structuredClone(manifest);
		delete missingAlias.lanes[0].alias;
		await writeFixture(root, missingAlias, rendered);
		await expect(checkRenderedValidationLaneTables(root)).rejects.toThrow(
			"validation lane table is stale",
		);

		const extraAlias = structuredClone(manifest);
		extraAlias.lanes[1].alias = "check:repository";
		await writeFixture(root, extraAlias, rendered);
		await expect(checkRenderedValidationLaneTables(root)).rejects.toThrow(
			"validation lane table is stale",
		);

		const reorderedAliases = structuredClone(manifest);
		reorderedAliases.lanes.reverse();
		await writeFixture(root, reorderedAliases, rendered);
		await expect(checkRenderedValidationLaneTables(root)).rejects.toThrow(
			"validation lane table is stale",
		);

		const extraAggregate = structuredClone(manifest);
		extraAggregate.aggregates.release = {
			lanes: ["unit"],
			nxTarget: "release:validate",
			mappingStatus: "mapped",
		};
		await writeFixture(root, extraAggregate, rendered);
		await expect(checkRenderedValidationLaneTables(root)).rejects.toThrow(
			"validation lane table is stale",
		);

		const reorderedAggregates = structuredClone(manifest);
		reorderedAggregates.aggregates = {
			second: {
				lanes: ["check"],
				nxTarget: "second",
				mappingStatus: "mapped",
			},
			"pull-request": reorderedAggregates.aggregates["pull-request"],
		};
		await writeFixture(root, reorderedAggregates, rendered);
		await expect(checkRenderedValidationLaneTables(root)).rejects.toThrow(
			"validation lane table is stale",
		);

		const modeDrift = structuredClone(manifest);
		modeDrift.lanes[0].nxTarget = "test:release-unit";
		await writeFixture(root, modeDrift, rendered);
		await expect(checkRenderedValidationLaneTables(root)).rejects.toThrow(
			"validation lane table is stale",
		);
	});

	it("replaces only an exactly marked block and checks direct invocation", () => {
		const table = renderValidationLaneTable(fixtureManifest());
		const contents = `before\n${validationLaneTableStart}\nstale\n${validationLaneTableEnd}\nafter`;
		expect(replaceValidationLaneTable(contents, table)).toBe(
			`before\n${table}\nafter`,
		);
		expect(() => replaceValidationLaneTable("missing markers", table)).toThrow(
			"markers are missing",
		);
		expect(() =>
			replaceValidationLaneTable(
				`${validationLaneTableEnd}\n${validationLaneTableStart}`,
				table,
			),
		).toThrow("markers are missing");

		const modulePath = fileURLToPath(
			new URL("./render-validation-lanes.mjs", import.meta.url),
		);
		expect(isDirectInvocation()).toBe(false);
		expect(isDirectInvocation(modulePath)).toBe(true);
		expect(isDirectInvocation("/tmp/render-validation-lanes.mjs")).toBe(false);
	});

	it("keeps the real documentation projection synchronized", async () => {
		await expect(
			checkRenderedValidationLaneTables(
				fileURLToPath(new URL("..", import.meta.url)),
			),
		).resolves.toBeUndefined();
	});
});
