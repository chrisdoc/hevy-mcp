export interface HevyConfig {
	apiKey?: string;
	confirmMutations: boolean;
}

export function parseConfig(
	argv: string[],
	env: NodeJS.ProcessEnv,
): HevyConfig {
	return {
		apiKey: env.HEVY_API_KEY || "",
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
