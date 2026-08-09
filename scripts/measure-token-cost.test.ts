import type { Tool } from "@modelcontextprotocol/server";
import {
	mkdtemp,
	readFile,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
	TOKEN_COST_SCHEMA_VERSION,
	TOKEN_ENCODING,
	TOTAL_TOKEN_BUDGET,
	formatTable,
	getTargetStatus,
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
	it("parses output, budget, and help options", () => {
		expect(
			parseArgs(["-o", "result.json", "--enforce-budget", "--help"]),
		).toEqual({
			help: true,
			enforceBudget: true,
			outputPath: "result.json",
		});
	});

	it("rejects unknown options and missing values", () => {
		expect(() => parseArgs(["--wat"])).toThrow("Unknown option: --wat");
		expect(() => parseArgs(["--output"])).toThrow("Missing value for --output");
		expect(() => parseArgs(["--output", "--enforce-budget"])).toThrow(
			"Missing value for --output",
		);
	});
});

describe("measureTokenPayload", () => {
	it("reports an empty registry without dividing by zero", () => {
		const report = measureTokenPayload([], { encode: () => [] });

		expect(report).toMatchObject({
			schemaVersion: TOKEN_COST_SCHEMA_VERSION,
			toolCount: 0,
			totalTokens: 0,
			averageTokensPerTool: 0,
			tools: [],
			targets: {
				totalTokens: {
					maximumInclusive: TOTAL_TOKEN_BUDGET,
					status: "withinTarget",
					enforced: true,
				},
			},
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

	it("uses inclusive budget boundaries", () => {
		expect(getTargetStatus(TOTAL_TOKEN_BUDGET, TOTAL_TOKEN_BUDGET, true)).toBe(
			"withinTarget",
		);
		expect(
			getTargetStatus(TOTAL_TOKEN_BUDGET + 1, TOTAL_TOKEN_BUDGET, true),
		).toBe("aboveTarget");
	});
});

describe("registered tool measurement", () => {
	it("lists unique tools through the public in-memory MCP APIs", async () => {
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
			listTools: () => Promise.resolve([tool("alpha", "measured")]),
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
				listTools: () => Promise.reject(new Error("collection failed")),
			}),
		).rejects.toThrow("collection failed");
		expect(free).toHaveBeenCalledOnce();
	});
});

describe("run", () => {
	it("prints help without measuring tools", async () => {
		const log = vi.fn();
		const measureTools = vi.fn(() => Promise.resolve(reportWith()));

		await run(["--help"], { log, measureTools });

		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("Usage: npm run measure:tokens -- [options]"),
		);
		expect(measureTools).not.toHaveBeenCalled();
	});

	it("prints a measurement without requiring an output path", async () => {
		const current = reportWith();
		const log = vi.fn();

		await run([], { log, measureTools: () => Promise.resolve(current) });

		expect(log).toHaveBeenCalledWith(formatTable(current));
	});

	it("writes a JSON report and enforces the total-token budget", async () => {
		const directory = await mkdtemp(join(tmpdir(), "hevy-token-cost-"));
		try {
			const outputPath = join(directory, "result.json");
			const overBudget = {
				...reportWith(),
				totalTokens: TOTAL_TOKEN_BUDGET + 1,
			};

			await expect(
				run(["--output", outputPath, "--enforce-budget"], {
					log: vi.fn(),
					measureTools: () => Promise.resolve(overBudget),
				}),
			).rejects.toThrow(
				`MCP tool catalog exceeds the 8900-token budget: ${TOTAL_TOKEN_BUDGET + 1}`,
			);
			expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(
				overBudget,
			);
			if (process.platform !== "win32")
				expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("does not overwrite an existing or symlink output", async () => {
		const directory = await mkdtemp(join(tmpdir(), "hevy-token-cost-"));
		try {
			const outputPath = join(directory, "result.json");
			await writeFile(outputPath, "keep me");
			await expect(
				run(["--output", outputPath], {
					log: vi.fn(),
					measureTools: () => Promise.resolve(reportWith()),
				}),
			).rejects.toMatchObject({ code: "EEXIST" });
			expect(await readFile(outputPath, "utf8")).toBe("keep me");

			const targetPath = join(directory, "target.json");
			const symlinkPath = join(directory, "symlink.json");
			await writeFile(targetPath, "keep target");
			await symlink(targetPath, symlinkPath);
			await expect(
				run(["--output", symlinkPath], {
					log: vi.fn(),
					measureTools: () => Promise.resolve(reportWith()),
				}),
			).rejects.toMatchObject({ code: "EEXIST" });
			expect(await readFile(targetPath, "utf8")).toBe("keep target");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});

describe("runCli and runDirectEntry", () => {
	it("reports unknown options and returns a failing exit code", async () => {
		const error = vi.fn();

		expect(await runCli(["--unknown"], { error })).toBe(1);
		expect(error).toHaveBeenCalledWith("Unknown option: --unknown");
	});

	it("sets the exit code for directly executed failures", async () => {
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
});
