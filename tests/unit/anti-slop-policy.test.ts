import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { describe, expect, it } from "vitest";

const rootDir = resolve(import.meta.dirname, "../..");
const testDir = join(rootDir, "tests", "unit");
const oxlintPath = join(rootDir, "node_modules", "oxlint", "bin", "oxlint");
const configPath = join(rootDir, "oxlint.config.ts");

const oxlintReportSchema = z.object({
	diagnostics: z.array(
		z.object({
			code: z.string(),
			message: z.string(),
		}),
	),
});

type LintResult = {
	readonly diagnostics: Array<{
		readonly code: string;
		readonly message: string;
	}>;
	readonly status: number;
};

function lintFixture(
	source: string,
	fileName: string,
	additionalArgs: readonly string[] = [],
): LintResult {
	const fixtureDirectory = mkdtempSync(join(testDir, ".anti-slop-policy-"));
	const fixturePath = join(fixtureDirectory, fileName);
	try {
		writeFileSync(fixturePath, source, "utf8");
		const result = spawnSync(
			process.execPath,
			[
				oxlintPath,
				"--config",
				configPath,
				"--no-ignore",
				"--format",
				"json",
				...additionalArgs,
				fixturePath,
			],
			{ cwd: rootDir, encoding: "utf8" },
		);
		if (result.error) throw result.error;
		const output = result.stdout.trim();
		if (output.length === 0) {
			throw new Error(result.stderr || "Oxlint returned no JSON report");
		}
		const report = oxlintReportSchema.parse(JSON.parse(output));
		return { diagnostics: report.diagnostics, status: result.status ?? 1 };
	} finally {
		rmSync(fixtureDirectory, { force: true, recursive: true });
	}
}

describe("lint policy examples", () => {
	it("accepts validated unknown input, primitive narrowing, and useful names", () => {
		const result = lintFixture(
			`import { z } from "zod";

const requestSchema = z.object({ name: z.string() });

export function parseRequest(input: unknown) {
	return requestSchema.parse(input);
}

export function readOptionalName(input: unknown): string | undefined {
	return typeof input === "string" ? input : undefined;
}

export function shape(value: string): string {
	return value;
}
`,
			"accepted.ts",
		);

		expect(result.status).toBe(0);
		expect(result.diagnostics).toEqual([]);
	});

	it("lets the type checker reject use of an unknown value before validation", () => {
		const result = lintFixture(
			`export function readUnvalidated(input: unknown): string {
	return input.name;
}
`,
			"unchecked.ts",
			["--type-aware", "--type-check"],
		);

		expect(result.status).not.toBe(0);
		expect(
			result.diagnostics.some(({ message }) => message.includes("unknown")),
		).toBe(true);
	});

	it("keeps assertion, promise, and focused-test checks active", () => {
		const result = lintFixture(
			`import { it } from "vitest";

export function fabricateDomainValue(input: unknown): string {
	return input as unknown as string;
}

export function forgetPromise(): void {
	Promise.resolve("unfinished");
}

it.only("must not be committed", () => {});
`,
			"policy-cases.test.ts",
		);

		const codes = result.diagnostics.map(({ code }) => code);
		expect(
			codes.some((code) => code.includes("no-chained-type-assertions")),
		).toBe(true);
		expect(codes.some((code) => code.includes("no-floating-promises"))).toBe(
			true,
		);
		expect(codes.some((code) => code.includes("no-focused-tests"))).toBe(true);
	});
});
