import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { get_encoding } from "tiktoken";
import { registerHevyTools } from "../src/tools/register.js";

export const TOKEN_COST_SCHEMA_VERSION = 1;
export const TOKEN_ENCODING = "cl100k_base";
export const MEASUREMENT_SCOPE =
	"Complete JSON-serialized MCP tools/list result payload: { tools }";
export const TOOL_COUNT_TARGET = 20;
export const AVERAGE_TOKEN_TARGET = 600;

export interface CliOptions {
	help: boolean;
	outputPath?: string;
	baselinePath?: string;
	markdownPath?: string;
}

export type TargetStatus = "withinTarget" | "aboveTarget";

export interface ToolTokenCost {
	name: string;
	tokens: number;
	percentageOfTotal: number;
}

export interface TokenCostReport {
	schemaVersion: number;
	encoding: string;
	measurementScope: string;
	toolCount: number;
	totalTokens: number;
	averageTokensPerTool: number;
	targets: {
		advisoryOnly: true;
		toolCountMax: number;
		toolCountStatus: TargetStatus;
		averageTokensPerToolMaxExclusive: number;
		averageTokensPerToolStatus: TargetStatus;
	};
	tools: ToolTokenCost[];
}

export interface BaselineComparison {
	baseline: TokenCostReport;
	totalTokensDelta: number;
	toolCountDelta: number;
	averageTokensPerToolDelta: number;
	toolDeltas: Array<{
		name: string;
		currentTokens?: number;
		baselineTokens?: number;
		delta: number;
	}>;
}

interface EncoderLike {
	encode(value: string): Uint32Array | number[];
}

interface EncoderResource extends EncoderLike {
	free(): void;
}

export interface MeasureRegisteredToolsDependencies {
	getEncoder?: (encoding: typeof TOKEN_ENCODING) => EncoderResource;
	listTools?: () => Promise<Tool[]>;
}

export interface RunDependencies {
	measureTools?: () => Promise<TokenCostReport>;
	log?: (message: string) => void;
	error?: (message: string) => void;
}

export function parseArgs(args: string[]): CliOptions {
	const options: CliOptions = { help: false };

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--help" || argument === "-h") {
			options.help = true;
			continue;
		}

		const optionKey =
			argument === "--output" || argument === "-o"
				? "outputPath"
				: argument === "--baseline"
					? "baselinePath"
					: argument === "--markdown"
						? "markdownPath"
						: undefined;

		if (!optionKey) {
			throw new Error(`Unknown option: ${argument ?? ""}`);
		}

		const value = args[index + 1];
		if (!value || value.startsWith("-")) {
			throw new Error(`Missing value for ${argument}`);
		}

		options[optionKey] = value;
		index += 1;
	}

	return options;
}

export function round(value: number, digits = 2): number {
	const factor = 10 ** digits;
	return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function getTargetStatus(
	value: number,
	target: number,
	inclusive: boolean,
): TargetStatus {
	return inclusive
		? value <= target
			? "withinTarget"
			: "aboveTarget"
		: value < target
			? "withinTarget"
			: "aboveTarget";
}

export function measureTokenPayload(
	tools: Tool[],
	encoder: EncoderLike,
): TokenCostReport {
	const totalTokens = encoder.encode(JSON.stringify({ tools })).length;
	const toolCosts = tools
		.map((tool) => ({
			name: tool.name,
			tokens: encoder.encode(JSON.stringify(tool)).length,
		}))
		.sort((left, right) => {
			if (right.tokens !== left.tokens) return right.tokens - left.tokens;
			return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
		});
	const toolCount = tools.length;
	const averageTokensPerTool = round(
		toolCount === 0 ? 0 : totalTokens / toolCount,
	);

	return {
		schemaVersion: TOKEN_COST_SCHEMA_VERSION,
		encoding: TOKEN_ENCODING,
		measurementScope: MEASUREMENT_SCOPE,
		toolCount,
		totalTokens,
		averageTokensPerTool,
		targets: {
			advisoryOnly: true,
			toolCountMax: TOOL_COUNT_TARGET,
			toolCountStatus: getTargetStatus(toolCount, TOOL_COUNT_TARGET, true),
			averageTokensPerToolMaxExclusive: AVERAGE_TOKEN_TARGET,
			averageTokensPerToolStatus: getTargetStatus(
				averageTokensPerTool,
				AVERAGE_TOKEN_TARGET,
				false,
			),
		},
		tools: toolCosts.map((tool) => ({
			...tool,
			percentageOfTotal: round(
				totalTokens === 0 ? 0 : (tool.tokens / totalTokens) * 100,
			),
		})),
	};
}

export function compareReports(
	current: TokenCostReport,
	baseline: TokenCostReport,
): BaselineComparison {
	const currentByName = new Map(
		current.tools.map((tool) => [tool.name, tool.tokens]),
	);
	const baselineByName = new Map(
		baseline.tools.map((tool) => [tool.name, tool.tokens]),
	);
	const names = [
		...new Set([...currentByName.keys(), ...baselineByName.keys()]),
	];

	const toolDeltas = names
		.map((name) => {
			const currentTokens = currentByName.get(name);
			const baselineTokens = baselineByName.get(name);
			return {
				name,
				currentTokens,
				baselineTokens,
				delta: (currentTokens ?? 0) - (baselineTokens ?? 0),
			};
		})
		.sort((left, right) => {
			const absoluteDelta = Math.abs(right.delta) - Math.abs(left.delta);
			if (absoluteDelta !== 0) return absoluteDelta;
			return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
		});

	return {
		baseline,
		totalTokensDelta: current.totalTokens - baseline.totalTokens,
		toolCountDelta: current.toolCount - baseline.toolCount,
		averageTokensPerToolDelta: round(
			current.averageTokensPerTool - baseline.averageTokensPerTool,
		),
		toolDeltas,
	};
}

export function isCompatibleBaseline(value: unknown): value is TokenCostReport {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<TokenCostReport>;
	return (
		candidate.schemaVersion === TOKEN_COST_SCHEMA_VERSION &&
		candidate.encoding === TOKEN_ENCODING &&
		candidate.measurementScope === MEASUREMENT_SCOPE &&
		typeof candidate.toolCount === "number" &&
		typeof candidate.totalTokens === "number" &&
		typeof candidate.averageTokensPerTool === "number" &&
		Array.isArray(candidate.tools) &&
		candidate.tools.every(
			(tool) =>
				typeof tool?.name === "string" && typeof tool.tokens === "number",
		)
	);
}

function formatDelta(value: number, suffix = ""): string {
	const prefix = value > 0 ? "+" : "";
	return `${prefix}${value}${suffix}`;
}

function formatStatus(status: TargetStatus): string {
	return status === "withinTarget" ? "Within target" : "Above target";
}

export function formatMarkdown(
	current: TokenCostReport,
	comparison?: BaselineComparison,
	baselineUnavailableReason?: string,
): string {
	const lines = [
		"## MCP tool token cost",
		"",
		`Measured with \`${current.encoding}\` over the ${current.measurementScope.toLowerCase()}.`,
		"Targets are advisory and never fail CI.",
		"",
		"| Metric | Current | Target | Status |",
		"| --- | ---: | ---: | --- |",
		`| Tools | ${current.toolCount} | ≤ ${current.targets.toolCountMax} | ${formatStatus(current.targets.toolCountStatus)} |`,
		`| Total tokens | ${current.totalTokens} | — | — |`,
		`| Average tokens/tool | ${current.averageTokensPerTool} | < ${current.targets.averageTokensPerToolMaxExclusive} | ${formatStatus(current.targets.averageTokensPerToolStatus)} |`,
		"",
	];

	if (comparison) {
		lines.push(
			"### Change from baseline",
			"",
			"| Metric | Baseline | Current | Delta |",
			"| --- | ---: | ---: | ---: |",
			`| Tools | ${comparison.baseline.toolCount} | ${current.toolCount} | ${formatDelta(comparison.toolCountDelta)} |`,
			`| Total tokens | ${comparison.baseline.totalTokens} | ${current.totalTokens} | ${formatDelta(comparison.totalTokensDelta)} |`,
			`| Average tokens/tool | ${comparison.baseline.averageTokensPerTool} | ${current.averageTokensPerTool} | ${formatDelta(comparison.averageTokensPerToolDelta)} |`,
			"",
			"### Per-tool changes",
			"",
			"| Tool | Baseline | Current | Delta |",
			"| --- | ---: | ---: | ---: |",
		);
		for (const tool of comparison.toolDeltas) {
			lines.push(
				`| \`${tool.name}\` | ${tool.baselineTokens ?? "—"} | ${tool.currentTokens ?? "—"} | ${formatDelta(tool.delta)} |`,
			);
		}
		lines.push("");
	} else if (baselineUnavailableReason) {
		lines.push(
			"### Baseline unavailable",
			"",
			baselineUnavailableReason,
			"Current measurements are still valid and were recorded.",
			"",
		);
	}

	lines.push(
		"### Per-tool breakdown",
		"",
		"| Tool | Tokens | Share of total |",
		"| --- | ---: | ---: |",
	);
	for (const tool of current.tools) {
		lines.push(
			`| \`${tool.name}\` | ${tool.tokens} | ${tool.percentageOfTotal}% |`,
		);
	}
	lines.push(
		"",
		"Per-tool counts encode each complete tool object independently. The total encodes the complete `{ tools }` envelope, so punctuation and separators mean the per-tool values need not sum exactly to the total.",
		"",
	);

	return lines.join("\n");
}

export function formatTable(report: TokenCostReport): string {
	const rows = report.tools.map((tool) => [
		tool.name,
		String(tool.tokens),
		`${tool.percentageOfTotal}%`,
	]);
	const nameWidth = Math.max(
		"Tool".length,
		...rows.map(([name]) => name.length),
	);
	const header = `${"Tool".padEnd(nameWidth)}  Tokens  Share`;
	return [
		`MCP tool token cost (${report.encoding})`,
		`Tools: ${report.toolCount} | Total: ${report.totalTokens} | Average: ${report.averageTokensPerTool}`,
		header,
		`${"-".repeat(nameWidth)}  ------  -----`,
		...rows.map(
			([name, tokens, share]) =>
				`${name.padEnd(nameWidth)}  ${tokens.padStart(6)}  ${share.padStart(5)}`,
		),
		"",
		"Targets (advisory): tools ≤ 20; average < 600 tokens/tool.",
		"Per-tool counts exclude the shared { tools } envelope punctuation.",
	].join("\n");
}

export async function listRegisteredTools(): Promise<Tool[]> {
	const server = new McpServer({
		name: "hevy-mcp-token-measurement",
		version: "1.0.0",
	});
	registerHevyTools(server, null);
	const client = new Client({
		name: "hevy-mcp-token-measurement-client",
		version: "1.0.0",
	});
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();

	try {
		await Promise.all([
			server.connect(serverTransport),
			client.connect(clientTransport),
		]);
		const { tools } = await client.listTools();
		return tools;
	} finally {
		await Promise.allSettled([client.close(), server.close()]);
	}
}

export async function measureRegisteredTools(
	dependencies: MeasureRegisteredToolsDependencies = {},
): Promise<TokenCostReport> {
	const encoder = (dependencies.getEncoder ?? get_encoding)(TOKEN_ENCODING);
	try {
		return measureTokenPayload(
			await (dependencies.listTools ?? listRegisteredTools)(),
			encoder,
		);
	} finally {
		encoder.free();
	}
}

async function loadBaseline(path: string): Promise<{
	report?: TokenCostReport;
	unavailableReason?: string;
}> {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
		if (!isCompatibleBaseline(parsed)) {
			return {
				unavailableReason: `The baseline at \`${path}\` is incompatible with schema version ${TOKEN_COST_SCHEMA_VERSION}, encoding \`${TOKEN_ENCODING}\`, or the current measurement scope.`,
			};
		}
		return { report: parsed };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			unavailableReason: `Could not read the baseline at \`${path}\`: ${message}`,
		};
	}
}

function helpText(): string {
	return [
		"Measure the serialized MCP tool-definition token cost.",
		"",
		"Usage: npm run measure:tokens -- [options]",
		"",
		"Options:",
		"  -o, --output <path>   Write schema-versioned JSON results",
		"      --baseline <path> Compare with a compatible JSON result",
		"      --markdown <path> Write a Markdown report",
		"  -h, --help            Show this help",
	].join("\n");
}

export async function run(
	args: string[],
	dependencies: RunDependencies = {},
): Promise<void> {
	const log = dependencies.log ?? console.log;
	const error = dependencies.error ?? console.error;
	const options = parseArgs(args);
	if (options.help) {
		log(helpText());
		return;
	}

	const report = await (dependencies.measureTools ?? measureRegisteredTools)();
	let comparison: BaselineComparison | undefined;
	let baselineUnavailableReason: string | undefined;
	if (options.baselinePath) {
		const baseline = await loadBaseline(options.baselinePath);
		if (baseline.report) comparison = compareReports(report, baseline.report);
		else baselineUnavailableReason = baseline.unavailableReason;
	}

	log(formatTable(report));
	if (baselineUnavailableReason) error(baselineUnavailableReason);

	if (options.outputPath) {
		await writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
	}
	if (options.markdownPath) {
		await writeFile(
			options.markdownPath,
			formatMarkdown(report, comparison, baselineUnavailableReason),
		);
	}
}

export async function runCli(
	args: string[],
	dependencies: RunDependencies = {},
): Promise<number> {
	try {
		await run(args, dependencies);
		return 0;
	} catch (error) {
		(dependencies.error ?? console.error)(
			error instanceof Error ? error.message : String(error),
		);
		return 1;
	}
}

export async function runDirectEntry(
	moduleUrl: string,
	args = process.argv,
	dependencies: RunDependencies = {},
	setExitCode: (exitCode: number) => void = (exitCode) => {
		process.exitCode = exitCode;
	},
): Promise<boolean> {
	const entryPath = args[1];
	if (!entryPath || moduleUrl !== pathToFileURL(entryPath).href) return false;
	setExitCode(await runCli(args.slice(2), dependencies));
	return true;
}

await runDirectEntry(import.meta.url);
