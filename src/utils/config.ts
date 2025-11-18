export interface HevyConfig {
	apiKey?: string;
	transportMode: "http" | "stdio";
	httpHost: string;
	httpPort: number;
	enableDnsRebindingProtection: boolean;
	allowedHosts: string[];
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

	const transportMode: "http" | "stdio" =
		argv.includes("--http") || env.MCP_TRANSPORT === "http" ? "http" : "stdio";
	const httpPort = Number.parseInt(env.MCP_HTTP_PORT || "3000", 10);
	const httpHost = env.MCP_HTTP_HOST || "127.0.0.1";
	const enableDnsRebindingProtection =
		env.MCP_DNS_REBINDING_PROTECTION === "true";
	const allowedHosts = env.MCP_ALLOWED_HOSTS?.split(",")
		.map((h) => h.trim())
		.filter(Boolean) || ["127.0.0.1"];

	return {
		apiKey,
		transportMode,
		httpHost,
		httpPort,
		enableDnsRebindingProtection,
		allowedHosts,
	};
}

export function assertApiKey(
	apiKey: string | undefined,
): asserts apiKey is string {
	if (!apiKey) {
		console.error(
			"Hevy API key is required. Provide via HEVY_API_KEY env variable, --hevy-api-key=YOUR_KEY command argument, or ?HEVY_API_KEY=YOUR_KEY query parameter.",
		);
		process.exit(1);
	}
}
