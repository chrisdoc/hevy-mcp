import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import type { Tool } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { get_encoding } from "tiktoken";
import { registerHevyTools } from "../packages/core/src/tools/register.js";
import { createToolRuntime } from "../packages/core/src/tools/tool-runtime.js";
import type { ExerciseTemplateCatalog } from "../packages/core/src/utils/exercise-template-catalog.js";

export const TOKEN_COST_SCHEMA_VERSION = 3;
export const TOKEN_ENCODING = "o200k_base";
export const MEASUREMENT_SCOPE =
	"Complete JSON-serialized MCP tools/list result payload: { tools }";
export const TOTAL_TOKEN_BUDGET = 8_900;

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { readonly [key: string]: JsonValue };
type TokenValue =
	| JsonValue
	| Tool
	| { readonly tools: Tool[] }
	| Tool["inputSchema"]
	| Tool["outputSchema"]
	| Tool["annotations"];

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
		totalTokens: {
			maximumInclusive: number;
			status: TargetStatus;
			enforced: true;
		};
	};
	tools: ToolTokenCost[];
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
			argument === "--output" || argument === "-o" ? "outputPath" : undefined;

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

function countEncodedTokens(
	value: TokenValue | undefined,
	encoder: EncoderLike,
): number {
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
		`Budget: total ≤ ${report.targets.totalTokens.maximumInclusive} tokens (enforced).`,
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
				get: () => Promise.resolve([]),
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
		"      --enforce-budget  Fail when total tokens exceed 8,900",
		"  -h, --help            Show this help",
	].join("\n");
}

export async function run(
	args: string[],
	dependencies: RunDependencies = {},
): Promise<void> {
	const log = dependencies.log ?? console.log;
	const options = parseArgs(args);
	if (options.help) {
		log(helpText());
		return;
	}

	const report = await (dependencies.measureTools ?? measureRegisteredTools)();

	log(formatTable(report));

	if (options.outputPath) {
		await writeNewOutput(
			options.outputPath,
			`${JSON.stringify(report, null, "\t")}\n`,
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
