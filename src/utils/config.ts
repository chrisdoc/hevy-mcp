export interface HevyConfig {
	apiKey?: string;
}

/**
 * Parse CLI arguments and environment to derive configuration.
 * Priority order for API key: CLI flag forms > environment variable.
 * Supported CLI arg forms:
 *   --hevy-api-key=KEY
 *   --hevyApiKey=KEY
 *   hevy-api-key=KEY (bare, e.g. when passed after npm start -- )
 */
export function parseConfig(
	argv: string[],
	env: NodeJS.ProcessEnv,
): HevyConfig {
	let apiKey = "";
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
				break;
			}
		}
		if (apiKey) break;
	}
	if (!apiKey) {
		apiKey = env.HEVY_API_KEY || "";
	}

	return {
		apiKey,
	};
}

export function assertApiKey(
	apiKey: string | undefined,
): asserts apiKey is string {
	if (!apiKey) {
		console.error(
			"Hevy API key is required. Provide it via the HEVY_API_KEY environment variable or the --hevy-api-key=YOUR_KEY command argument.",
		);
		process.exit(1);
	}
}
