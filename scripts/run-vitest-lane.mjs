import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildVitestArgs, isVitestSelector } from "./vitest-lane-execution.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = resolve(root, "node_modules/vitest/vitest.mjs");
const [laneId, ...forwardedArgs] = process.argv.slice(2);
const registry = JSON.parse(
	readFileSync(resolve(root, "repository/validation-lanes.json"), "utf8"),
);
const lane = registry.lanes.find((candidate) => candidate.id === laneId);
if (!lane || !isVitestSelector(lane.selector)) {
	throw new Error(`Unknown Vitest lane ${laneId || "<missing>"}`);
}

const args = buildVitestArgs(lane.selector);
if (laneId === "unit") {
	// Lets slow, expensive tests that duplicate the `check` targets skip
	// themselves in the fast unit lane (see check-generated-client.test.ts).
	process.env.HEVY_UNIT_LANE = "1";
}
if (process.env.HEVY_TEST_REPORT_MODE === "ci") {
	const nodeMajor = Number.parseInt(process.versions.node, 10);
	if (nodeMajor === 24) {
		if (laneId === "unit") {
			args.push(
				"--coverage",
				"--coverage.reportsDirectory=coverage/unit",
				"--reporter=default",
				"--reporter=junit",
				"--outputFile.junit=test-results/unit-tests.xml",
			);
		}
		if (laneId === "mocked-mcp") {
			args.push("--coverage", "--coverage.reportsDirectory=coverage/mocked");
		}
	}
}
args.push(...forwardedArgs);

const result = spawnSync(process.execPath, [vitest, ...args], {
	cwd: root,
	env: process.env,
	stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) {
	throw new Error(
		`Vitest ${laneId} lane failed with ${result.signal ? `signal ${result.signal}` : `exit code ${result.status ?? 1}`}`,
	);
}
