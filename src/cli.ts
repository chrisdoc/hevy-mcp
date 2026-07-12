import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runServer } from "./index.js";
import { assertApiKey, parseConfig } from "./node/config.js";
import { SERVER_NAME, SERVER_VERSION } from "./server-metadata.js";
import { createSafeErrorDiagnostic } from "./utils/safe-error-diagnostic.js";

const HELP_TEXT = [
	"Usage:",
	"  hevy-mcp [options]",
	"",
	"Options:",
	"  -h, --help                 Show this help message and exit",
	"  -v, --version              Show version and exit",
	"",
	"Environment:",
	"  HEVY_API_KEY=<api-key>     Hevy API key from Hevy app settings",
	"  HEVY_MCP_DEBUG=1           Enable verbose diagnostics on stderr",
	"",
	"Examples:",
	"  HEVY_API_KEY=your-key npx hevy-mcp",
].join("\n");

function getCliAction(args: string[]): "start" | "version" | "help" {
	for (const arg of args) {
		if (arg === "--version" || arg === "-v") {
			return "version";
		}

		if (arg === "--help" || arg === "-h") {
			return "help";
		}
	}

	return "start";
}

interface CliDependencies {
	runServer: (apiKey: string) => Promise<void>;
}

export async function runCli(
	args: string[] = process.argv.slice(2),
	env: NodeJS.ProcessEnv = process.env,
	dependencies: CliDependencies = { runServer },
) {
	const cliAction = getCliAction(args);

	if (cliAction === "version") {
		// Stdio MCP protocol output must remain reserved for server messages.
		console.error(`${SERVER_NAME} v${SERVER_VERSION}`);
		return;
	}

	if (cliAction === "help") {
		console.log(HELP_TEXT);
		return;
	}

	const { apiKey } = parseConfig(env);
	assertApiKey(apiKey);
	await dependencies.runServer(apiKey);
}

export function isMainModule(
	argv: readonly string[],
	moduleUrl: string,
	resolveRealpath: (path: string) => string,
): boolean {
	if (argv[1] === undefined) return false;
	try {
		return resolveRealpath(argv[1]) === fileURLToPath(moduleUrl);
	} catch {
		return false;
	}
}

export async function runCliIfMain(
	isMain: boolean,
	execute: () => Promise<void>,
	exit: (code: number) => void,
): Promise<void> {
	if (!isMain) return;

	try {
		await execute();
	} catch (error) {
		console.error("Fatal error in main()", createSafeErrorDiagnostic(error));
		exit(1);
	}
}

void runCliIfMain(
	isMainModule(process.argv, import.meta.url, realpathSync),
	runCli,
	process.exit.bind(process),
);
