import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import type { Tool } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { get_encoding } from "tiktoken";
import { registerHevyTools } from "../packages/core/src/tools/register.js";
import { createToolRuntime } from "../packages/core/src/tools/tool-runtime.js";
import type { ExerciseTemplateCatalog } from "../packages/core/src/utils/exercise-template-catalog.js";

export const TOKEN_COST_SCHEMA_VERSION = 2;
export const TOKEN_ENCODING = "o200k_base";
export const MEASUREMENT_SCOPE =
	"Complete JSON-serialized MCP tools/list result payload: { tools }";
export const TOOL_COUNT_TARGET = 20;
export const AVERAGE_TOKEN_TARGET = 600;
export const TOTAL_TOKEN_BUDGET = 8_900;

export type ToolComponent =
	| "name"
	| "description"
	| "inputSchema"
	| "outputSchema"
	| "annotations";

export const TOOL_COMPONENTS: readonly ToolComponent[] = [
	"name",
	"description",
	"inputSchema",
	"outputSchema",
	"annotations",
];

export type ComponentTokenTotals = Record<ToolComponent, number>;

export interface CliOptions {
	help: boolean;
	enforceBudget: boolean;
	outputPath?: string;
	baselinePath?: string;
	markdownPath?: string;
}

export type TargetStatus = "withinTarget" | "aboveTarget";

export interface ToolTokenCost {
	name: string;
	tokens: number;
	percentageOfTotal: number;
	componentTokens: ComponentTokenTotals;
}

export interface TokenCostReport {
	schemaVersion: number;
	encoding: string;
	measurementScope: string;
	toolCount: number;
	totalTokens: number;
	averageTokensPerTool: number;
	componentTokens: ComponentTokenTotals;
	targets: {
		toolCount: {
			maximumInclusive: number;
			status: TargetStatus;
			enforced: false;
		};
		averageTokensPerTool: {
			maximumExclusive: number;
			status: TargetStatus;
			enforced: false;
		};
		totalTokens: {
			maximumInclusive: number;
			status: TargetStatus;
			enforced: true;
		};
	};
	tools: ToolTokenCost[];
}

export interface BaselineComparison {
	baseline: TokenCostReport;
	totalTokensDelta: number;
	toolCountDelta: number;
	averageTokensPerToolDelta: number;
	componentTokenDeltas: ComponentTokenTotals;
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

const OPTION_TOKENS = new Set([
	"--help",
	"-h",
	"--output",
	"-o",
	"--baseline",
	"--markdown",
	"--enforce-budget",
]);

export function parseArgs(args: string[]): CliOptions {
	const options: CliOptions = { help: false, enforceBudget: false };

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--help" || argument === "-h") {
			options.help = true;
			continue;
		}
		if (argument === "--enforce-budget") {
			options.enforceBudget = true;
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
		if (!value || OPTION_TOKENS.has(value)) {
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

function countEncodedTokens(value: unknown, encoder: EncoderLike): number {
	const serialized = JSON.stringify(value);
	return serialized === undefined ? 0 : encoder.encode(serialized).length;
}

function emptyComponentTokenTotals(): ComponentTokenTotals {
	return {
		name: 0,
		description: 0,
		inputSchema: 0,
		outputSchema: 0,
		annotations: 0,
	};
}

function measureToolComponentTokens(
	tool: Tool,
	encoder: EncoderLike,
): ComponentTokenTotals {
	const values = {
		name: tool.name,
		description: tool.description,
		inputSchema: tool.inputSchema,
		outputSchema: tool.outputSchema,
		annotations: tool.annotations,
	};
	const componentTokens = emptyComponentTokenTotals();
	for (const component of TOOL_COMPONENTS) {
		componentTokens[component] = countEncodedTokens(values[component], encoder);
	}
	return componentTokens;
}

function sumComponentTokenTotals(
	tools: Array<Pick<ToolTokenCost, "componentTokens">>,
): ComponentTokenTotals {
	const totals = emptyComponentTokenTotals();
	for (const tool of tools) {
		for (const component of TOOL_COMPONENTS) {
			totals[component] += tool.componentTokens[component];
		}
	}
	return totals;
}

export function measureTokenPayload(
	tools: Tool[],
	encoder: EncoderLike,
): TokenCostReport {
	const totalTokens = countEncodedTokens({ tools }, encoder);
	const toolCosts = tools
		.map((tool) => {
			const componentTokens = measureToolComponentTokens(tool, encoder);
			return {
				name: tool.name,
				tokens: countEncodedTokens(tool, encoder),
				componentTokens,
			};
		})
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
		componentTokens: sumComponentTokenTotals(toolCosts),
		targets: {
			toolCount: {
				maximumInclusive: TOOL_COUNT_TARGET,
				status: getTargetStatus(toolCount, TOOL_COUNT_TARGET, true),
				enforced: false,
			},
			averageTokensPerTool: {
				maximumExclusive: AVERAGE_TOKEN_TARGET,
				status: getTargetStatus(
					averageTokensPerTool,
					AVERAGE_TOKEN_TARGET,
					false,
				),
				enforced: false,
			},
			totalTokens: {
				maximumInclusive: TOTAL_TOKEN_BUDGET,
				status: getTargetStatus(totalTokens, TOTAL_TOKEN_BUDGET, true),
				enforced: true,
			},
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

	const componentTokenDeltas = emptyComponentTokenTotals();
	for (const component of TOOL_COMPONENTS) {
		componentTokenDeltas[component] =
			current.componentTokens[component] - baseline.componentTokens[component];
	}
	return {
		baseline,
		totalTokensDelta: current.totalTokens - baseline.totalTokens,
		toolCountDelta: current.toolCount - baseline.toolCount,
		averageTokensPerToolDelta: round(
			current.averageTokensPerTool - baseline.averageTokensPerTool,
		),
		componentTokenDeltas,
		toolDeltas,
	};
}

function hasComponentTokenTotals(
	value: unknown,
): value is ComponentTokenTotals {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return TOOL_COMPONENTS.every(
		(component) => typeof candidate[component] === "number",
	);
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
		hasComponentTokenTotals(candidate.componentTokens) &&
		Array.isArray(candidate.tools) &&
		candidate.tools.every(
			(tool) =>
				typeof tool?.name === "string" &&
				typeof tool.tokens === "number" &&
				hasComponentTokenTotals(tool.componentTokens),
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
		[
			`Measured with \`${current.encoding}\` over the`,
			`${current.measurementScope.toLowerCase()}.`,
		].join(" "),
		"Targets are advisory except the enforced total-token budget.",
		"",
		"| Metric | Current | Target | Status |",
		"| --- | ---: | ---: | --- |",
		[
			`| Tools | ${current.toolCount} | `,
			`≤ ${current.targets.toolCount.maximumInclusive} | ${formatStatus(current.targets.toolCount.status)} |`,
		].join(""),
		[
			`| Total tokens | ${current.totalTokens} | `,
			`≤ ${current.targets.totalTokens.maximumInclusive} | ${formatStatus(current.targets.totalTokens.status)} |`,
		].join(""),
		[
			`| Average tokens/tool | ${current.averageTokensPerTool} | `,
			`< ${current.targets.averageTokensPerTool.maximumExclusive} | ${formatStatus(current.targets.averageTokensPerTool.status)} |`,
		].join(""),
		"",
	];
	lines.push(
		"### Component totals",
		"",
		"| Component | Tokens |",
		"| --- | ---: |",
	);
	for (const component of TOOL_COMPONENTS) {
		lines.push(`| \`${component}\` | ${current.componentTokens[component]} |`);
	}
	lines.push("");

	if (comparison) {
		lines.push(
			"### Change from baseline",
			"",
			"| Metric | Baseline | Current | Delta |",
			"| --- | ---: | ---: | ---: |",
			[
				`| Tools | ${comparison.baseline.toolCount} | ${current.toolCount} | `,
				`${formatDelta(comparison.toolCountDelta)} |`,
			].join(""),
			[
				`| Total tokens | ${comparison.baseline.totalTokens} | ${current.totalTokens} | `,
				`${formatDelta(comparison.totalTokensDelta)} |`,
			].join(""),
			[
				`| Average tokens/tool | ${comparison.baseline.averageTokensPerTool} | ${current.averageTokensPerTool} | `,
				`${formatDelta(comparison.averageTokensPerToolDelta)} |`,
			].join(""),
			"",
			"### Per-tool changes",
			"",
			"| Tool | Baseline | Current | Delta |",
			"| --- | ---: | ---: | ---: |",
		);
		for (const tool of comparison.toolDeltas) {
			lines.push(
				[
					`| \`${tool.name}\` | ${tool.baselineTokens ?? "—"} | `,
					`${tool.currentTokens ?? "—"} | ${formatDelta(tool.delta)} |`,
				].join(""),
			);
		}
		lines.push("");

		lines.push(
			"### Component changes",
			"",
			"| Component | Delta |",
			"| --- | ---: |",
		);
		for (const component of TOOL_COMPONENTS) {
			lines.push(
				[
					`| \`${component}\` | `,
					`${formatDelta(comparison.componentTokenDeltas[component])} |`,
				].join(""),
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
		[
			"| Tool | ",
			TOOL_COMPONENTS.map((component) => `\`${component}\``).join(" | "),
			" | Total | Share of total |",
		].join(""),
		[
			"| --- | ",
			TOOL_COMPONENTS.map(() => "---:").join(" | "),
			" | ---: | ---: |",
		].join(""),
	);
	for (const tool of current.tools) {
		lines.push(
			[
				`| \`${tool.name}\` | `,
				TOOL_COMPONENTS.map(
					(component) => tool.componentTokens[component],
				).join(" | "),
				` | ${tool.tokens} | ${tool.percentageOfTotal}% |`,
			].join(""),
		);
	}
	lines.push(
		"",
		[
			"Per-component counts are diagnostic and non-additive because keys and separators live in complete tool objects.",
			"Per-tool counts encode each complete tool object independently.",
			"The total encodes the complete `{ tools }` envelope, so punctuation and separators mean the per-tool values need not sum exactly to the total.",
		].join(" "),
		"",
	);

	return lines.join("\n");
}

export function formatTable(report: TokenCostReport): string {
	const headers = ["Tool", ...TOOL_COMPONENTS, "Total", "Share"];
	const rows = report.tools.map((tool) => [
		tool.name,
		...TOOL_COMPONENTS.map((component) =>
			String(tool.componentTokens[component]),
		),
		String(tool.tokens),
		`${tool.percentageOfTotal}%`,
	]);
	const widths = headers.map((header, index) =>
		Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
	);
	const formatRow = (values: string[]) =>
		values
			.map((value, index) =>
				index === 0
					? value.padEnd(widths[index] ?? value.length)
					: value.padStart(widths[index] ?? value.length),
			)
			.join("  ");
	const divider = widths.map((width) => "-".repeat(width)).join("  ");
	return [
		`MCP tool token cost (${report.encoding})`,
		`Tools: ${report.toolCount} | Total: ${report.totalTokens} | Average: ${report.averageTokensPerTool}`,
		[
			"Component totals: ",
			TOOL_COMPONENTS.map(
				(component) => `${component}=${report.componentTokens[component]}`,
			).join(" | "),
		].join(""),
		formatRow(headers),
		divider,
		...rows.map(formatRow),
		"",
		[
			`Targets: tools ≤ ${report.targets.toolCount.maximumInclusive}; average < `,
			`${report.targets.averageTokensPerTool.maximumExclusive} tokens/tool; total ≤ ${report.targets.totalTokens.maximumInclusive} tokens (enforced).`,
		].join(""),
		"Per-tool counts exclude the shared { tools } envelope punctuation.",
	].join("\n");
}

export async function listRegisteredTools(): Promise<Tool[]> {
	const server = new McpServer({
		name: "hevy-mcp-token-measurement",
		version: "1.0.0",
	});
	registerHevyTools(
		server,
		createToolRuntime({
			client: null,
			catalog: {
				get: async () => [],
				reset: () => {},
			} satisfies ExerciseTemplateCatalog,
		}),
	);
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
	diagnostic?: string;
}> {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
		if (!isCompatibleBaseline(parsed)) {
			return {
				unavailableReason: `The comparison baseline is incompatible with schema version ${TOKEN_COST_SCHEMA_VERSION}, encoding \`${TOKEN_ENCODING}\`, or the current measurement scope.`,
			};
		}
		return { report: parsed };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			unavailableReason:
				"The comparison baseline could not be read; see the workflow logs for details.",
			diagnostic: `Could not read the baseline at ${path}: ${message}`,
		};
	}
}

async function writeNewOutput(path: string, contents: string): Promise<void> {
	await writeFile(path, contents, {
		encoding: "utf8",
		flag: "wx",
		mode: 0o600,
	});
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
		"      --enforce-budget     Fail when total tokens exceed 8,900",
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
	let baselineDiagnostic: string | undefined;
	if (options.baselinePath) {
		const baseline = await loadBaseline(options.baselinePath);
		if (baseline.report) comparison = compareReports(report, baseline.report);
		else {
			baselineUnavailableReason = baseline.unavailableReason;
			baselineDiagnostic = baseline.diagnostic;
		}
	}

	log(formatTable(report));
	if (baselineUnavailableReason) {
		error(baselineDiagnostic ?? baselineUnavailableReason);
	}

	if (options.outputPath) {
		await writeNewOutput(
			options.outputPath,
			`${JSON.stringify(report, null, "\t")}\n`,
		);
	}
	if (options.markdownPath) {
		await writeNewOutput(
			options.markdownPath,
			formatMarkdown(report, comparison, baselineUnavailableReason),
		);
	}
	if (options.enforceBudget && report.totalTokens > TOTAL_TOKEN_BUDGET) {
		throw new Error(
			`MCP tool catalog exceeds the 8900-token budget: ${report.totalTokens}`,
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
