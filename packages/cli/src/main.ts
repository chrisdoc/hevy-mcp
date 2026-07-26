import { createHevyClient, type HevyClient } from "@hevy-mcp/hevy-client";
import { HELP, parseArguments, UsageError } from "./arguments.js";
import { getApiKey } from "./auth.js";
import { diagnostic, EXIT } from "./errors.js";
import { execute } from "./commands/index.js";
import { writeResult, type Streams } from "./output/write.js";

declare const __HEVY_CLI_VERSION__: string;
export interface RunCliOptions {
	argv: string[];
	env?: Record<string, string | undefined>;
	clientFactory?: (key: string) => HevyClient;
	now?: () => Date;
	streams?: Streams;
	version?: string;
}

export async function runCli(options: RunCliOptions): Promise<number> {
	const streams = options.streams ?? {
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
	};
	try {
		const args = await parseArguments(options.argv);
		if (args.options.help || (!args.command && !args.options.version)) {
			streams.stdout(HELP);
			return 0;
		}
		if (args.options.version) {
			streams.stdout(`${options.version ?? __HEVY_CLI_VERSION__}\n`);
			return 0;
		}
		const key = getApiKey(options.env ?? process.env);
		const client = (
			options.clientFactory ?? ((apiKey) => createHevyClient({ apiKey }))
		)(key);
		const result = await execute(args, client, options.now);
		writeResult(result, args.options.json === true, streams);
		return 0;
	} catch (error) {
		const isUsage = error instanceof UsageError;
		const failure = isUsage
			? { code: EXIT.usage, message: error.message }
			: diagnostic(error);
		streams.stderr(`${failure.message}\n`);
		return failure.code;
	}
}
