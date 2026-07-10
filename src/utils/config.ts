export interface HevyConfig {
	apiKey?: string;
	confirmMutations: boolean;
}

const DEPRECATED_CLI_ARGUMENT_WARNING = [
	"DEPRECATION WARNING: Passing the Hevy API key via CLI arguments",
	"(--hevy-api-key=..., --hevyApiKey=..., hevy-api-key=...) is",
	"deprecated and insecure. Use the HEVY_API_KEY environment",
	"variable instead.",
].join(" ");

/**
 * Parse CLI arguments and environment to derive configuration.
 * Priority order for API key: deprecated CLI flag forms > environment variable.
 * Supported deprecated CLI arg forms:
 *   --hevy-api-key=KEY
 *   --hevyApiKey=KEY
 *   hevy-api-key=KEY (bare, e.g. when passed after npm start -- )
 */
export function parseConfig(
	argv: string[],
	env: NodeJS.ProcessEnv,
): HevyConfig {
	let apiKey = "";
	let usedDeprecatedApiKeyArg = false;
	const apiKeyArgPatterns = [
		/^--hevy-api-key=(.+)$/i,
		/^--hevyApiKey=(.+)$/i,
		/^hevy-api-key=(.+)$/i,
	];
	for (const raw of argv) {
		for (const pattern of apiKeyArgPatterns) {
			const m = raw.match(pattern);
			if (m) {
				apiKey = m[1];
				usedDeprecatedApiKeyArg = true;
				break;
			}
		}
		if (apiKey) break;
	}
	if (usedDeprecatedApiKeyArg) {
		console.error(DEPRECATED_CLI_ARGUMENT_WARNING);
	}
	if (!apiKey) {
		apiKey = env.HEVY_API_KEY || "";
	}

	return {
		apiKey,
		confirmMutations:
			argv.some((argument) => argument === "--confirm-mutations") ||
			env.HEVY_MCP_CONFIRM_MUTATIONS === "1",
	};
}

export function assertApiKey(
	apiKey: string | undefined,
): asserts apiKey is string {
	if (!apiKey) {
		console.error(
			"Hevy API key is required. Provide it via the HEVY_API_KEY environment variable.",
		);
		process.exit(1);
	}
}
