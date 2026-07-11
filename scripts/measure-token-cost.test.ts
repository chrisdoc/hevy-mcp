import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
	AVERAGE_TOKEN_TARGET,
	TOKEN_COST_SCHEMA_VERSION,
	TOKEN_ENCODING,
	TOOL_COUNT_TARGET,
	compareReports,
	formatMarkdown,
	formatTable,
	getTargetStatus,
	isCompatibleBaseline,
	listRegisteredTools,
	measureRegisteredTools,
	measureTokenPayload,
	parseArgs,
	round,
	run,
	runCli,
	runDirectEntry,
} from "./measure-token-cost.js";

const encoder = {
	encode(value: string) {
		return Array.from(value, (character) => character.codePointAt(0) ?? 0);
	},
};

function tool(name: string, description: string): Tool {
	return {
		name,
		description,
		inputSchema: { type: "object", properties: {} },
	};
}

function reportWith(tools: Tool[] = [tool("alpha", "current")]) {
	return measureTokenPayload(tools, encoder);
}

describe("parseArgs", () => {
	it("parses output, baseline, markdown, and help options", () => {
		expect(
			parseArgs([
				"-o",
				"result.json",
				"--baseline",
				"base.json",
				"--markdown",
				"report.md",
				"--help",
			]),
		).toEqual({
			help: true,
			outputPath: "result.json",
			baselinePath: "base.json",
			markdownPath: "report.md",
		});
	});

	it("rejects unknown options and missing values", () => {
		expect(() => parseArgs(["--wat"])).toThrow("Unknown option: --wat");
		expect(() => parseArgs(["--output"])).toThrow("Missing value for --output");
	});
});

describe("measureTokenPayload", () => {
	it("reports an empty registry without dividing by zero", () => {
		const report = measureTokenPayload([], { encode: () => [] });

		expect(report).toMatchObject({
			toolCount: 0,
			totalTokens: 0,
			averageTokensPerTool: 0,
			tools: [],
		});
	});

	it("counts the complete payload and sorts tools deterministically", () => {
		const tools = [tool("zeta", "short"), tool("alpha", "much longer")];
		const report = measureTokenPayload(tools, encoder);

		expect(report.totalTokens).toBe(JSON.stringify({ tools }).length);
		expect(report.tools.map(({ name }) => name)).toEqual(["alpha", "zeta"]);
		expect(report.averageTokensPerTool).toBe(
			round(report.totalTokens / tools.length),
		);
		expect(report.tools[0]?.percentageOfTotal).toBe(
			round((JSON.stringify(tools[1]).length / report.totalTokens) * 100),
		);
	});

	it("uses a name tie-break for equal token counts", () => {
		const descendingInput = measureTokenPayload(
			[tool("beta", "same"), tool("alpha", "same")],
			encoder,
		);
		const ascendingInput = measureTokenPayload(
			[tool("alpha", "same"), tool("beta", "same")],
			encoder,
		);
		const duplicateNames = measureTokenPayload(
			[tool("alpha", "same"), tool("alpha", "same")],
			encoder,
		);

		expect(descendingInput.tools.map(({ name }) => name)).toEqual([
			"alpha",
			"beta",
		]);
		expect(ascendingInput.tools.map(({ name }) => name)).toEqual([
			"alpha",
			"beta",
		]);
		expect(duplicateNames.tools).toHaveLength(2);
	});
});

describe("targets and comparisons", () => {
	it("applies both sides of inclusive and exclusive targets", () => {
		expect(getTargetStatus(20, 20, true)).toBe("withinTarget");
		expect(getTargetStatus(21, 20, true)).toBe("aboveTarget");
		expect(getTargetStatus(599.99, 600, false)).toBe("withinTarget");
		expect(getTargetStatus(600, 600, false)).toBe("aboveTarget");
	});

	it("computes total and per-tool deltas including missing comparator paths", () => {
		const baseline = reportWith([tool("alpha", "old"), tool("removed", "old")]);
		const current = reportWith([
			tool("alpha", "new content"),
			tool("added", "new"),
		]);
		const comparison = compareReports(current, baseline);

		expect(comparison.totalTokensDelta).toBe(
			current.totalTokens - baseline.totalTokens,
		);
		expect(comparison.toolDeltas).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "added",
					baselineTokens: undefined,
				}),
				expect.objectContaining({
					name: "removed",
					currentTokens: undefined,
				}),
			]),
		);
		expect(
			comparison.toolDeltas.find(({ name }) => name === "added")?.delta,
		).toBeGreaterThan(0);
		expect(
			comparison.toolDeltas.find(({ name }) => name === "removed")?.delta,
		).toBeLessThan(0);
	});

	it("sorts equal absolute deltas by name", () => {
		const baseline = reportWith([tool("beta", "x"), tool("alpha", "x")]);
		const current = reportWith([tool("beta", "xx"), tool("alpha", "xx")]);
		const reversedCurrent = {
			...current,
			tools: [...current.tools].reverse(),
		};

		expect(
			compareReports(current, baseline).toolDeltas.map(({ name }) => name),
		).toEqual(["alpha", "beta"]);
		expect(
			compareReports(reversedCurrent, baseline).toolDeltas.map(
				({ name }) => name,
			),
		).toEqual(["alpha", "beta"]);
	});
});

describe("isCompatibleBaseline", () => {
	it("accepts compatible reports", () => {
		expect(isCompatibleBaseline(reportWith())).toBe(true);
	});

	it.each([
		["missing value", undefined],
		["non-object", "report"],
		[
			"schema",
			{ ...reportWith(), schemaVersion: TOKEN_COST_SCHEMA_VERSION + 1 },
		],
		["encoding", { ...reportWith(), encoding: `${TOKEN_ENCODING}-other` }],
		["scope", { ...reportWith(), measurementScope: "tool bodies only" }],
		["tool count", { ...reportWith(), toolCount: "1" }],
		["total", { ...reportWith(), totalTokens: "1" }],
		["average", { ...reportWith(), averageTokensPerTool: "1" }],
		["tools collection", { ...reportWith(), tools: {} }],
		["tool name", { ...reportWith(), tools: [{ name: 1, tokens: 2 }] }],
		[
			"tool tokens",
			{ ...reportWith(), tools: [{ name: "alpha", tokens: "2" }] },
		],
	])("rejects incompatible %s data", (_case, value) => {
		expect(isCompatibleBaseline(value)).toBe(false);
	});
});

describe("formatMarkdown", () => {
	it("renders current totals and explains envelope overhead", () => {
		const report = reportWith();
		const markdown = formatMarkdown(report);

		expect(markdown).toContain("## MCP tool token cost");
		expect(markdown).toContain(`| Total tokens | ${report.totalTokens}`);
		expect(markdown).toContain("need not sum exactly");
	});

	it("renders baseline deltas and added/removed tool fallbacks", () => {
		const baseline = reportWith([tool("alpha", "old"), tool("removed", "old")]);
		const current = reportWith([tool("alpha", "newer"), tool("added", "new")]);
		const markdown = formatMarkdown(current, compareReports(current, baseline));

		expect(markdown).toContain("### Change from baseline");
		expect(markdown).toContain("| `added` | — |");
		expect(markdown).toMatch(/\| `removed` \| \d+ \| — \|/);
	});

	it("renders an unavailable baseline explanation", () => {
		expect(formatMarkdown(reportWith(), undefined, "Not available.")).toContain(
			"### Baseline unavailable\n\nNot available.",
		);
	});
});

describe("formatTable", () => {
	it("aligns headings, values, shares, and advisory guidance", () => {
		const table = formatTable(
			reportWith([tool("a", "small"), tool("much-longer-name", "large")]),
		);

		expect(table).toContain(`MCP tool token cost (${TOKEN_ENCODING})`);
		expect(table).toContain("Tool              Tokens  Share");
		expect(table).toMatch(/much-longer-name\s+\d+\s+\d+(?:\.\d+)?%/);
		expect(table).toContain(
			`Targets (advisory): tools ≤ ${TOOL_COUNT_TARGET}; average < ${AVERAGE_TOKEN_TARGET} tokens/tool.`,
		);
	});
});

describe("registered tool measurement", () => {
	it("lists tools through the public in-memory MCP APIs", async () => {
		const tools = await listRegisteredTools();
		const names = tools.map(({ name }) => name);

		expect(names.length).toBeGreaterThan(0);
		expect(new Set(names).size).toBe(names.length);
		expect(names.every((name) => name.length > 0)).toBe(true);
	});

	it("selects the configured encoder and always frees it", async () => {
		const free = vi.fn();
		const getEncoder = vi.fn(() => ({ ...encoder, free }));
		const report = await measureRegisteredTools({
			getEncoder,
			listTools: async () => [tool("alpha", "measured")],
		});

		expect(getEncoder).toHaveBeenCalledWith(TOKEN_ENCODING);
		expect(report.toolCount).toBe(1);
		expect(free).toHaveBeenCalledOnce();
	});

	it("frees the encoder when tool collection fails", async () => {
		const free = vi.fn();
		await expect(
			measureRegisteredTools({
				getEncoder: () => ({ ...encoder, free }),
				listTools: async () => {
					throw new Error("collection failed");
				},
			}),
		).rejects.toThrow("collection failed");
		expect(free).toHaveBeenCalledOnce();
	});
});

describe("run", () => {
	it("prints help without measuring tools", async () => {
		const log = vi.fn();
		const measureTools = vi.fn(async () => reportWith());

		await run(["--help"], { log, measureTools });

		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("Usage: npm run measure:tokens -- [options]"),
		);
		expect(measureTools).not.toHaveBeenCalled();
	});

	it("writes JSON and Markdown with a compatible baseline", async () => {
		const directory = await mkdtemp(join(tmpdir(), "hevy-token-cost-"));
		try {
			const outputPath = join(directory, "result.json");
			const baselinePath = join(directory, "baseline.json");
			const markdownPath = join(directory, "report.md");
			const baseline = reportWith([tool("alpha", "old")]);
			const current = reportWith([
				tool("alpha", "newer"),
				tool("added", "new"),
			]);
			const log = vi.fn();
			await writeFile(baselinePath, JSON.stringify(baseline));

			await run(
				[
					"--output",
					outputPath,
					"--baseline",
					baselinePath,
					"--markdown",
					markdownPath,
				],
				{ log, measureTools: async () => current },
			);

			expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(current);
			expect(await readFile(markdownPath, "utf8")).toContain(
				"### Change from baseline",
			);
			expect(log).toHaveBeenCalledWith(formatTable(current));
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it.each([
		["incompatible", JSON.stringify({ schemaVersion: -1 }), "incompatible"],
		["malformed", "{nope", "Could not read"],
	])(
		"degrades a %s baseline to an unavailable report",
		async (_case, baselineContents, expectedError) => {
			const directory = await mkdtemp(join(tmpdir(), "hevy-token-cost-"));
			try {
				const baselinePath = join(directory, "baseline.json");
				const markdownPath = join(directory, "report.md");
				const error = vi.fn();
				await writeFile(baselinePath, baselineContents);

				await run(["--baseline", baselinePath, "--markdown", markdownPath], {
					error,
					log: vi.fn(),
					measureTools: async () => reportWith(),
				});

				expect(error).toHaveBeenCalledWith(
					expect.stringContaining(expectedError),
				);
				expect(await readFile(markdownPath, "utf8")).toContain(
					"### Baseline unavailable",
				);
			} finally {
				await rm(directory, { recursive: true, force: true });
			}
		},
	);

	it("degrades an unreadable baseline to an unavailable report", async () => {
		const directory = await mkdtemp(join(tmpdir(), "hevy-token-cost-"));
		try {
			const baselinePath = join(directory, "missing.json");
			const markdownPath = join(directory, "report.md");
			const error = vi.fn();

			await run(["--baseline", baselinePath, "--markdown", markdownPath], {
				error,
				log: vi.fn(),
				measureTools: async () => reportWith(),
			});

			expect(error).toHaveBeenCalledWith(
				expect.stringContaining("Could not read the baseline"),
			);
			expect(await readFile(markdownPath, "utf8")).toContain(
				"Current measurements are still valid",
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});

describe("runCli", () => {
	it("reports unknown options and returns a failing exit code", async () => {
		const error = vi.fn();

		expect(await runCli(["--unknown"], { error })).toBe(1);
		expect(error).toHaveBeenCalledWith("Unknown option: --unknown");
	});

	it("returns a successful exit code", async () => {
		expect(await runCli(["--help"], { log: vi.fn(), error: vi.fn() })).toBe(0);
	});

	it("stringifies non-Error failures", async () => {
		const error = vi.fn();
		expect(
			await runCli([], {
				error,
				measureTools: async () => Promise.reject("measurement failed"),
			}),
		).toBe(1);
		expect(error).toHaveBeenCalledWith("measurement failed");
	});
});

describe("runDirectEntry", () => {
	it("sets the exit code for a directly executed unknown option", async () => {
		const entryPath = join(tmpdir(), "measure-token-cost.ts");
		const error = vi.fn();
		const setExitCode = vi.fn();

		expect(
			await runDirectEntry(
				pathToFileURL(entryPath).href,
				["node", entryPath, "--unknown"],
				{ error },
				setExitCode,
			),
		).toBe(true);
		expect(error).toHaveBeenCalledWith("Unknown option: --unknown");
		expect(setExitCode).toHaveBeenCalledWith(1);
	});

	it("ignores imports and missing entry paths", async () => {
		expect(await runDirectEntry("file:///module.ts", ["node"])).toBe(false);
		expect(
			await runDirectEntry("file:///module.ts", ["node", "/other.ts"]),
		).toBe(false);
	});

	it("uses process.exitCode for direct execution by default", async () => {
		const previousExitCode = process.exitCode;
		const entryPath = join(tmpdir(), "measure-token-cost.ts");
		try {
			expect(
				await runDirectEntry(
					pathToFileURL(entryPath).href,
					["node", entryPath, "--help"],
					{ log: vi.fn() },
				),
			).toBe(true);
			expect(process.exitCode).toBe(0);
		} finally {
			process.exitCode = previousExitCode;
		}
	});
});
