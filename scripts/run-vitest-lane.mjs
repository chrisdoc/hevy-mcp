import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = resolve(root, "node_modules/vitest/vitest.mjs");
const [lane, ...forwardedArgs] = process.argv.slice(2);
const selectors = {
	unit: [
		"--exclude",
		"tests/integration/**",
		"--exclude",
		"tests/performance/**",
	],
	mocked: ["tests/integration/mocked"],
};
if (!Object.hasOwn(selectors, lane)) {
	throw new Error(`Unknown Vitest lane ${lane || "<missing>"}`);
}

const args = ["run", ...selectors[lane]];
if (process.env.HEVY_TEST_REPORT_MODE === "ci") {
	const nodeMajor = Number.parseInt(process.versions.node, 10);
	if (lane === "unit") {
		args.push("--coverage", "--coverage.reportsDirectory=coverage/unit");
		if (nodeMajor === 24) {
			args.push(
				"--reporter=default",
				"--reporter=junit",
				"--outputFile.junit=test-results/unit-tests.xml",
			);
		}
	}
	if (lane === "mocked" && nodeMajor === 24) {
		args.push("--coverage", "--coverage.reportsDirectory=coverage/mocked");
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
		`Vitest ${lane} lane failed with ${result.signal ? `signal ${result.signal}` : `exit code ${result.status ?? 1}`}`,
	);
}
