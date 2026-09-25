import { describe, expect, it } from "vitest";
import {
	buildVitestArgs,
	commandInvokesPackageScript,
	hasVitestLaneRunner,
	hasValidVitestLaneAlias,
	hasValidVitestLaneNxCommands,
} from "./vitest-lane-execution.mjs";

describe("Vitest lane execution", () => {
	it("builds include and exclude arguments from the registry selector", () => {
		expect(
			buildVitestArgs({
				kind: "vitest",
				include: ["tests/contract/runtime.test.ts"],
				exclude: ["tests/integration/**", "tests/performance/**"],
			}),
		).toEqual([
			"run",
			"tests/contract/runtime.test.ts",
			"--exclude",
			"tests/integration/**",
			"--exclude",
			"tests/performance/**",
		]);
	});

	it("converts recursive directory includes to Vitest path filters", () => {
		expect(
			buildVitestArgs({
				kind: "vitest",
				include: ["tests/integration/mocked/**"],
			}),
		).toEqual(["run", "tests/integration/mocked/"]);
	});

	it("uses the configured Vitest project for Worker selectors", () => {
		expect(
			buildVitestArgs({
				kind: "vitest-worker-config",
				config: "vitest.workers.config.ts",
			}),
		).toEqual(["run", "--config", "vitest.workers.config.ts"]);
	});

	it("requires root Vitest selectors to invoke their matching lane ID", () => {
		const lane = { id: "contract", selector: { kind: "vitest" } };
		expect(
			hasVitestLaneRunner(lane, [
				"mise exec -- node scripts/testing/run-vitest-lane.mjs contract",
			]),
		).toBe(true);
		expect(
			hasVitestLaneRunner(lane, [
				"mise exec -- node scripts/testing/run-vitest-lane.mjs stdio",
			]),
		).toBe(false);
		expect(
			hasVitestLaneRunner(lane, [
				"mise exec -- vitest run tests/contract/runtime.test.ts",
			]),
		).toBe(false);
		expect(
			hasVitestLaneRunner(lane, [
				"mise exec -- node ./packages/scripts/testing/run-vitest-lane.mjs contract",
			]),
		).toBe(true);
		expect(
			hasVitestLaneRunner(lane, [
				"node scripts/testing/run-vitest-lane.mjs contract",
				"mise exec -- vitest run tests/contract/runtime.test.ts",
			]),
		).toBe(false);
	});

	it("validates the alias and Nx execution routes independently", () => {
		const lane = {
			alias: "test:contract",
			id: "contract",
			nxTarget: "test:contract",
			selector: { kind: "vitest" },
		};
		const alias =
			"mise exec -- node scripts/testing/run-vitest-lane.mjs contract";
		expect(hasValidVitestLaneAlias(lane, alias)).toBe(true);
		expect(
			hasValidVitestLaneNxCommands(lane, ["pnpm run test:contract"], true),
		).toBe(true);
		expect(hasValidVitestLaneNxCommands(lane, [], true)).toBe(false);
		expect(
			hasValidVitestLaneNxCommands(
				lane,
				["node scripts/testing/run-vitest-lane.mjs stdio"],
				true,
			),
		).toBe(false);
		expect(
			hasValidVitestLaneNxCommands(
				lane,
				[
					"node scripts/testing/run-vitest-lane.mjs contract",
					"vitest run tests/contract/runtime.test.ts",
				],
				true,
			),
		).toBe(false);
		expect(
			hasValidVitestLaneAlias(
				lane,
				"mise exec -- nx run repository:test:contract",
			),
		).toBe(true);
		expect(
			commandInvokesPackageScript(
				"mise exec -- pnpm run test:contract",
				"test:contract",
			),
		).toBe(true);
	});
});
