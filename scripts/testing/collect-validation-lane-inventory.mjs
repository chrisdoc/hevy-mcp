import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildVitestArgs } from "./vitest-lane-execution.mjs";
import {
	findMissingVitestCases,
	parseVitestList,
	selectVitestCases,
	summarizeLaneOverlaps,
} from "./validation-lane-inventory.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const vitest = resolve(root, "node_modules/vitest/vitest.mjs");
const registry = JSON.parse(
	readFileSync(resolve(root, "repository/validation-lanes.json"), "utf8"),
);
const credentialNames = new Set(
	registry.lanes.flatMap((lane) => lane.credentials ?? []),
);
const formatOption = process.argv
	.slice(2)
	.find((argument) => argument.startsWith("--format="));
const format = formatOption?.replace(/^--format=/, "") ?? "markdown";
if (format !== "markdown" && format !== "json") {
	throw new Error(`Unsupported output format ${format}`);
}

const workspaces = readdirSync(resolve(root, "packages"), {
	withFileTypes: true,
})
	.filter((entry) => entry.isDirectory())
	.map((entry) => {
		const directory = resolve(root, "packages", entry.name);
		const manifest = JSON.parse(
			readFileSync(resolve(directory, "package.json"), "utf8"),
		);
		return { directory, manifest };
	});
const aggregateRuns = Object.entries(registry.aggregates).flatMap(
	([aggregateId, aggregate]) =>
		aggregate.lanes.map((laneId) => ({
			aggregate: aggregateId,
			workflowRuntimes:
				aggregate.workflowRuntimes?.[laneId] ??
				(aggregate.workflowRuntimes &&
				!Array.isArray(aggregate.workflowRuntimes)
					? undefined
					: aggregate.workflowRuntimes),
			laneId,
		})),
);

function safeEnvironment(laneId) {
	const env = { ...process.env };
	for (const credentialName of credentialNames) delete env[credentialName];
	delete env.HEVY_RUN_LIVE_WORKER_TESTS;
	delete env.HEVY_TEST_REPORT_MODE;
	delete env.HEVY_UNIT_LANE;
	if (laneId === "unit") env.HEVY_UNIT_LANE = "1";
	return env;
}

function runVitestList(args, cwd, env, { json = true } = {}) {
	args[0] = "list";
	if (json) args.push("--json");
	const result = spawnSync(process.execPath, [vitest, ...args], {
		cwd,
		env,
		encoding: "utf8",
		maxBuffer: 16 * 1024 * 1024,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`Vitest list failed in ${relative(root, cwd) || "."}: ${result.stderr || result.stdout}`,
		);
	}
	return parseVitestList(result.stdout, root);
}

function requireCases(laneId, cases) {
	if (cases.length === 0) {
		throw new Error(`Vitest selector for lane ${laneId} discovered no cases`);
	}
	return cases;
}

const unitRootCases = runVitestList(
	buildVitestArgs({
		kind: "vitest",
		exclude: ["tests/integration/**", "tests/performance/**"],
	}),
	root,
	safeEnvironment("unit"),
);
const releaseRootCases = runVitestList(
	buildVitestArgs({ kind: "vitest", exclude: ["tests/integration/**"] }),
	root,
	safeEnvironment("release-unit"),
);

function discoverLane(lane) {
	if (lane.credentials?.length > 0) {
		return {
			status: "not-enumerated",
			reason: "Credential-gated lane; no credential is provided to discovery.",
		};
	}

	const selector = lane.selector;
	if (selector.kind === "vitest-worker-config") {
		const cases = requireCases(
			lane.id,
			runVitestList(buildVitestArgs(selector), root, safeEnvironment(lane.id), {
				json: false,
			}),
		);
		return {
			status: "enumerated",
			method:
				"vitest list --config; modules are loaded for exact registration, but test bodies are not executed",
			cases,
		};
	}
	if (selector.kind === "vitest") {
		const selectsIntegration = selector.include?.some((pattern) =>
			pattern.startsWith("tests/integration/"),
		);
		const cases = requireCases(
			lane.id,
			selectsIntegration
				? runVitestList(
						buildVitestArgs(selector),
						root,
						safeEnvironment(lane.id),
					)
				: selectVitestCases(
						selector,
						lane.id === "unit" ? unitRootCases : releaseRootCases,
					),
		);
		const discovery = {
			status: "enumerated",
			method:
				"vitest list --json; modules are loaded for exact registration, but test bodies are not executed",
			cases,
		};
		if (lane.id === "unit") {
			const defaultEnvironmentCases = selectVitestCases(
				selector,
				releaseRootCases,
			);
			discovery.skippedCases = findMissingVitestCases(
				defaultEnvironmentCases,
				cases,
			).map((testCase) => ({
				...testCase,
				reason: "Skipped when HEVY_UNIT_LANE=1",
			}));
		}
		return discovery;
	}

	if (selector.kind === "workspace-test") {
		const workspace = workspaces.find(
			(candidate) => candidate.manifest.name === selector.workspace,
		);
		if (!workspace) {
			return {
				status: "not-enumerated",
				reason: `Workspace ${selector.workspace} was not found.`,
			};
		}
		if (workspace.manifest.scripts?.test !== "vitest run") {
			return {
				status: "not-enumerated",
				reason: "Workspace test command is not the supported Vitest runner.",
			};
		}
		const cases = requireCases(
			lane.id,
			runVitestList(["run"], workspace.directory, safeEnvironment(lane.id)),
		);
		return {
			status: "enumerated",
			method:
				"workspace Vitest list --json; modules are loaded for exact registration, but test bodies are not executed",
			cases,
		};
	}

	if (selector.kind === "node-test") {
		return {
			status: "file-only",
			method: "Node test runner; test names are not enumerated",
			files: selector.include ?? [],
		};
	}

	return {
		status: "not-applicable",
		reason:
			"This lane validates a build, package, repository policy, or external artifact rather than enumerated test cases.",
	};
}

function describeSetup(lane) {
	if (lane.selector.kind === "vitest") {
		return {
			config: "vitest.config.ts",
			setupFiles: ["tests/setup/cloudflare-runtime.ts"],
			workerShim: "tests/shims/cloudflare-workers.ts",
		};
	}
	if (lane.selector.kind === "vitest-worker-config") {
		return { config: lane.selector.config };
	}
	if (lane.selector.kind === "workspace-test") {
		return {
			workspace: lane.selector.workspace,
			workingDirectory: relative(
				root,
				workspaces.find(
					(candidate) => candidate.manifest.name === lane.selector.workspace,
				)?.directory ?? root,
			),
			testCommand: "vitest run",
		};
	}
	if (lane.selector.kind === "node-test") return { runner: "node --test" };
	return { selector: lane.selector.kind };
}

const lanes = registry.lanes.map((lane) => {
	const discovery = discoverLane(lane);
	return {
		id: lane.id,
		alias: lane.alias ?? null,
		nxTarget: lane.nxTarget ?? null,
		mappingStatus: lane.mappingStatus,
		gate: lane.gate,
		comparison: lane.comparison,
		runtimes: lane.runtimes,
		runtimeDetails: lane.runtimes.map((runtimeId) => ({
			id: runtimeId,
			...registry.runtimeMatrix[runtimeId],
		})),
		workflowRuntimes: lane.workflowRuntimes ?? null,
		credentials: lane.credentials,
		artifacts: lane.artifacts,
		selector: lane.selector,
		setup: describeSetup(lane),
		aggregateRuns: aggregateRuns.filter((run) => run.laneId === lane.id),
		workflowEnvironment: aggregateRuns.some(
			(run) => run.laneId === lane.id && run.aggregate === "pull-request-ci",
		)
			? { HEVY_TEST_REPORT_MODE: "ci" }
			: {},
		runnerEnvironment: lane.id === "unit" ? { HEVY_UNIT_LANE: "1" } : {},
		discovery,
	};
});
const overlapReport = summarizeLaneOverlaps(lanes);
const unitLane = lanes.find((lane) => lane.id === "unit");
const inventory = {
	registryVersion: registry.version,
	currentNode: process.version,
	runtimeMatrix: registry.runtimeMatrix,
	lanes,
	overlaps: overlapReport,
};

if (format === "json") {
	process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
} else {
	const lines = [
		"# Validation lane inventory",
		"",
		`Generated from registry v${registry.version} on ${process.version} using Vitest test discovery.`,
		"",
		"This records test identities and declared lane dimensions; it does not claim that matching identities are equivalent. Runtime, setup, environment, credentials, report, and artifact differences remain separate until reviewed.",
		"",
		"## Lane inventory",
		"",
		"| Lane | Aggregate | Execution runtime matrix | CI runner override | Discovery | Cases / files | Credentials | Artifacts |",
		"| --- | --- | --- | --- | --- | ---: | --- | --- |",
	];
	for (const lane of lanes) {
		const runs =
			lane.aggregateRuns.map(({ aggregate }) => aggregate).join(", ") || "—";
		const runtimes = lane.runtimeDetails
			.map((runtime) => `${runtime.id} (${runtime.version})`)
			.join(", ");
		const workflowRuntimes = [
			...(lane.workflowRuntimes ?? []),
			...lane.aggregateRuns.flatMap((run) => run.workflowRuntimes ?? []),
		]
			.toSorted((left, right) => left.localeCompare(right))
			.filter(
				(runtime, index, all) => index === 0 || runtime !== all[index - 1],
			)
			.join(", ");
		const discovery = lane.discovery.status;
		const count =
			lane.discovery.status === "enumerated"
				? lane.discovery.cases.length
				: lane.discovery.status === "file-only"
					? lane.discovery.files.length
					: "—";
		lines.push(
			`| \`${lane.id}\` | ${runs} | ${runtimes} | ${workflowRuntimes || "—"} | ${discovery} | ${count} | ${lane.credentials.join(", ") || "—"} | ${lane.artifacts.join(", ") || "—"} |`,
		);
	}
	lines.push(
		"",
		"## Setup, environment, and interpretation",
		"",
		"Root Vitest lanes use `vitest.config.ts`, including `tests/setup/cloudflare-runtime.ts` and the `cloudflare:workers` shim. The Workerd lane uses `vitest.workers.config.ts`. The CLI lane runs `vitest run` from its workspace. Unit sets `HEVY_UNIT_LANE=1`; CI also sets `HEVY_TEST_REPORT_MODE=ci`, which enables unit JUnit/coverage and mocked coverage output on Node 24. Artifact IDs are copied from the lane registry; output paths and task dependencies are owned by `project.json` and the lane runner.",
		"",
		`Test names were registered on the current Node version shown above. Runtime matrices are configured coverage, not an assertion that this inventory command executed Node 26 or Workerd tests. Vitest loads test modules to register exact names, but does not execute test bodies or report their pass/skip state. Unit lists ${unitLane?.discovery.cases.length ?? 0} identities under HEVY_UNIT_LANE=1 and separately records ${unitLane?.discovery.skippedCases?.length ?? 0} identities only listed when that flag is unset. Credential-gated lanes are not loaded and receive no credentials. Non-Vitest checks are recorded at lane/file identity only.`,
		"",
		"## Exact test overlaps",
		"",
		"Only enumerated cases are compared. Test identity is the repository-relative file plus the full Vitest suite/test name. Matching identities are evidence of repeated registration, not proof that lanes are interchangeable. The JSON output retains exact identities and per-lane occurrence counts.",
		"",
		"| Lane pair | Matching test identities |",
		"| --- | ---: |",
	);
	for (const pair of overlapReport.pairs) {
		lines.push(
			`| ${pair.lanes.map((id) => `\`${id}\``).join(" / ")} | ${pair.cases} |`,
		);
	}
	if (overlapReport.pairs.length === 0) lines.push("| None | 0 |\n");
	lines.push(
		"",
		"Credential-gated integration lanes are intentionally not discovered. Discovery may require the same built outputs as the lane. For the complete test identities, lane selectors, runtime/setup/artifact metadata, and exact overlap cases, run `mise exec -- pnpm run report:test-lanes -- --format=json`.",
		"",
	);
	process.stdout.write(lines.join("\n"));
}
