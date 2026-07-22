import { describe, expect, it } from "vitest";
import {
	findImportViolations,
	inspectFileWithCompiler,
	packageRules,
} from "../../scripts/check-package-boundaries.mjs";

const coreRule = packageRules.get("packages/core");
if (!coreRule) throw new Error("core boundary rule is missing");

describe("package boundary AST checker", () => {
	it("uses the TypeScript compiler AST for workspace files", () => {
		const result = inspectFileWithCompiler(
			"tests/fixtures/package-boundary-syntax.cts",
		);
		if (!result) throw new Error("Compiler inspection returned no result");
		expect(result.usedCompilerApi).toBe(true);
		expect(result.edges.map(({ specifier }) => specifier)).toEqual(
			expect.arrayContaining([
				"@hevy-mcp/hevy-client",
				"@hevy-mcp/hevy-client/types",
				"@hevy-mcp/hevy-client/schemas",
			]),
		);
		expect(result.edges).toHaveLength(5);
		expect(result.edges.map(({ kind }) => kind)).toEqual(
			expect.arrayContaining(["import-equals", "import()", "require"]),
		);
		expect(result.nonLiteralCalls).toEqual([]);
	});

	it("rejects escaped relative imports and non-literal loading", () => {
		const failures = findImportViolations({
			source: `import "../../node/src/index.ts"; import(` + "name" + `);`,
			file: "/repo/packages/core/src/file.ts",
			fileName: "file.ts",
			relativePackage: "packages/core",
			packageRoot: "/repo/packages/core",
			rule: coreRule,
		});
		expect(failures).toEqual([
			"packages/core: non-literal dynamic import/require in /repo/packages/core/src/file.ts",
			"packages/core: relative import escapes package: ../../node/src/index.ts",
		]);
	});

	it("rejects runtime adapters and unexported internal subpaths", () => {
		const failures = findImportViolations({
			source: `import "@hevy-mcp/hevy-client/generated/client/api"; import "node:fs"; import "cloudflare:workers";`,
			file: "/repo/packages/core/src/file.ts",
			fileName: "file.ts",
			relativePackage: "packages/core",
			packageRoot: "/repo/packages/core",
			rule: coreRule,
		});
		expect(failures).toEqual([
			"packages/core: forbidden internal import: @hevy-mcp/hevy-client/generated/client/api",
			"packages/core: forbidden Node builtin import: node:fs",
			"packages/core: forbidden runtime import: cloudflare:workers",
		]);
	});
});
