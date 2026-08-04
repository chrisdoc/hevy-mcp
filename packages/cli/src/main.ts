import { createHevyClient, type HevyClient } from "@hevy-mcp/hevy-client";
import { bindClientExecution, type ToolExecutionContext } from "@hevy-mcp/core";
import { createOperations, type HevyOperations } from "@hevy-mcp/operations";
import { getApiKey } from "./auth.js";
import { diagnostic, EXIT } from "./errors.js";
import { readDataSource, type DataSourceReader } from "./input.js";
import { runRoutes } from "./routes.js";
import { writeResult, type Streams } from "./output/write.js";
export interface RunCliOptions {
	argv: string[];
	env?: Record<string, string | undefined>;
	clientFactory?: (key: string) => HevyClient;
	now?: () => Date;
	readDataSource?: DataSourceReader;
	streams?: Streams;
	execution?: ToolExecutionContext;
}

export async function runCli(options: RunCliOptions): Promise<number> {
	const streams = options.streams ?? {
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
	};
	const state: { result?: unknown; error?: unknown } = {};
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
	};
	const metaCommand = options.argv.some((value) =>
		["--help", "-h", "--version", "-v"].includes(value),
	);
	try {
		if (!metaCommand) {
			const key = getApiKey(options.env ?? globalThis.process.env);
			const createdClient = (
				options.clientFactory ?? ((apiKey) => createHevyClient({ apiKey }))
			)(key);
			const client = options.execution
				? bindClientExecution(createdClient, options.execution)
				: createdClient;
			context.client = client;
			context.operations = createOperations(client);
		}
		const exitCode = await runRoutes(options.argv, context);
		if (state.error !== undefined) throw state.error;
		if (exitCode !== 0) return EXIT.usage;
		if (state.result !== undefined) {
			const json = options.argv.includes("--json");
			writeResult(state.result, json, streams);
		}
		return 0;
	} catch (error) {
		const failure = diagnostic(error);
		if (options.argv.includes("--json")) {
			streams.stderr(`${JSON.stringify(failure)}\n`);
		} else {
			streams.stderr(`${failure.message}\n`);
		}
		return failure.code;
	}
}
