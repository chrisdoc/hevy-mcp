import {
	createHevyClient,
	type HevyClient,
	type HevyExecutionOptions,
} from "@hevy-mcp/hevy-client";
import { createOperations, type HevyOperations } from "@hevy-mcp/operations";
import { getApiKey } from "./auth.js";
import { diagnostic, EXIT } from "./errors.js";
import { readDataSource, type DataSourceReader } from "./input.js";
import { runRoutes, type CliState } from "./routes.js";
import { writeResult, type Streams } from "./output/write.js";
export interface RunCliOptions {
	argv: string[];
	env?: Record<string, string | undefined>;
	clientFactory?: (key: string) => HevyClient;
	now?: () => Date;
	readDataSource?: DataSourceReader;
	streams?: Streams;
	execution?: HevyExecutionOptions;
}

const cliCommands = new Set([
	"user",
	"workouts",
	"routines",
	"exercises",
	"folders",
	"measurements",
	"summary",
]);
const cliSubcommands = new Set([
	"list",
	"get",
	"count",
	"events",
	"search",
	"history",
	"create",
	"update",
]);

function writeCliEvent(
	streams: Streams,
	argv: string[],
	startedAt: number,
	result: {
		outcome: "success" | "failure";
		exitCode: number;
		errorCode?: string;
	},
): void {
	const command = cliCommands.has(argv[0] ?? "") ? argv[0] : undefined;
	const subcommand = cliSubcommands.has(argv[1] ?? "") ? argv[1] : undefined;
	try {
		streams.stderr(
			`${JSON.stringify({
				timestamp: new Date().toISOString(),
				level: result.outcome === "success" ? "info" : "error",
				event: "cli.command",
				outcome: result.outcome,
				exit_code: result.exitCode,
				duration_ms: Math.round(performance.now() - startedAt),
				command: command ?? "unknown",
				subcommand: subcommand ?? "unknown",
				error_code: result.errorCode ?? null,
			})}\n`,
		);
	} catch {
		// Optional CLI logging must not change the command result.
	}
}

export async function runCli(options: RunCliOptions): Promise<number> {
	const env = options.env ?? globalThis.process.env;
	const streams = options.streams ?? {
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
	};
	const state: CliState = {};
	const stricliProcess = {
		stdout: { write: streams.stdout },
		stderr: { write: streams.stderr },
		exitCode: undefined as number | undefined,
	};
	const context = {
		process: stricliProcess,
		state,
		now: options.now ?? (() => new Date()),
		readDataSource: options.readDataSource ?? readDataSource,
		client: undefined as HevyClient | undefined,
		operations: undefined as HevyOperations | undefined,
		execution: options.execution,
	};
	const metaCommand = options.argv.some((value) =>
		["--help", "-h", "--version", "-v"].includes(value),
	);
	const logEnabled = !metaCommand && env.HEVY_CLI_LOG === "true";
	const startedAt = performance.now();
	try {
		if (!metaCommand) {
			const key = getApiKey(env);
			const createdClient = (
				options.clientFactory ?? ((apiKey) => createHevyClient({ apiKey }))
			)(key);
			context.client = createdClient;
			context.operations = createOperations(createdClient, {
				trainingSummaryMaxWeeks: 520,
				trainingSummaryStrictPagination: true,
			});
		}
		const exitCode = await runRoutes(options.argv, context);
		if (state.error !== undefined) throw state.error;
		if (exitCode !== 0) {
			if (logEnabled)
				writeCliEvent(streams, options.argv, startedAt, {
					outcome: "failure",
					exitCode: EXIT.usage,
				});
			return EXIT.usage;
		}
		if (state.result !== undefined) {
			const json = options.argv.includes("--json");
			writeResult(state.result, json, streams);
		}
		if (logEnabled)
			writeCliEvent(streams, options.argv, startedAt, {
				outcome: "success",
				exitCode: 0,
			});
		return 0;
	} catch (error) {
		const normalizedError = error instanceof Error ? error : String(error);
		const failure = diagnostic(normalizedError);
		if (logEnabled)
			writeCliEvent(streams, options.argv, startedAt, {
				outcome: "failure",
				exitCode: failure.code,
				errorCode: failure.error_code,
			});
		if (options.argv.includes("--json")) {
			streams.stderr(`${JSON.stringify(failure)}\n`);
		} else {
			streams.stderr(`${failure.message}\n`);
		}
		return failure.code;
	}
}
