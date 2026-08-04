import { describe, expect, it } from "vitest";
import {
	findImportViolations,
	packageRules,
} from "./check-package-boundaries.mjs";

const workerRule = packageRules.get("packages/worker");
if (!workerRule) throw new Error("worker boundary rule is missing");

describe("package boundary AST checker", () => {
	it("keeps compiler-backed Worker parity with the retired boundary checker", () => {
		const failures = findImportViolations({
			source: `import "node:fs"; import "@sentry/node"; import "../../node/src/index.ts";`,
			file: "/repo/packages/worker/src/worker.ts",
			fileName: "worker.ts",
			relativePackage: "packages/worker",
			packageRoot: "/repo/packages/worker",
			rule: workerRule,
		});
		expect(failures).toEqual([
			"packages/worker: forbidden Node builtin import: node:fs",
			"packages/worker: forbidden runtime import: @sentry/node",
			"packages/worker: relative import escapes package: ../../node/src/index.ts",
		]);
	});

	it("enforces the CLI boundary from the same topology graph", () => {
		const cliRule = packageRules.get("packages/cli");
		if (!cliRule) throw new Error("cli boundary rule is missing");
		expect(
			findImportViolations({
				source: `import "@hevy-mcp/core"; import "cloudflare:workers";`,
				file: "/repo/packages/cli/src/cli.ts",
				fileName: "cli.ts",
				relativePackage: "packages/cli",
				packageRoot: "/repo/packages/cli",
				rule: cliRule,
			}),
		).toEqual(["packages/cli: forbidden runtime import: cloudflare:workers"]);
	});
});
