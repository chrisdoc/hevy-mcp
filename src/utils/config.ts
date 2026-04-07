export interface HevyConfig {
	apiKey?: string;
	transport?: "stdio" | "http" | "http+oauth";
	port?: number;
	issuerUrl?: string;
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
	let transport: "stdio" | "http" | "http+oauth" | undefined;
	let port: number | undefined;
	let issuerUrl: string | undefined;

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
		const transportMatch = raw.match(/^--transport=(stdio|http|http\+oauth)$/i);
		if (transportMatch) {
			transport = transportMatch[1].toLowerCase() as
				| "stdio"
				| "http"
				| "http+oauth";
		}
		const portMatch = raw.match(/^--port=(\d+)$/);
		if (portMatch) {
			const parsedPort = parseInt(portMatch[1], 10);
			if (parsedPort < 0 || parsedPort > 65535) {
				throw new Error(
					`Invalid --port value "${portMatch[1]}". Expected an integer between 0 and 65535.`,
				);
			}
			port = parsedPort;
		}
		const issuerMatch = raw.match(/^--issuer-url=(.+)$/i);
		if (issuerMatch) {
			issuerUrl = issuerMatch[1];
		}
	}
	if (!apiKey) {
		apiKey = env.HEVY_API_KEY || "";
	}
	if (!issuerUrl) {
		issuerUrl = env.MCP_ISSUER_URL;
	}

	return {
		apiKey,
		transport,
		port,
		issuerUrl,
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

export function assertIssuerUrl(
	url: string | undefined,
): asserts url is string {
	if (!url) {
		console.error(
			"Issuer URL is required for http+oauth transport. Provide it via the MCP_ISSUER_URL environment variable or the --issuer-url=URL command argument.",
		);
		process.exit(1);
	}
}
