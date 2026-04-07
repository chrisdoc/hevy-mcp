export interface HevyConfig {
	apiKey?: string;
	transport?: "stdio" | "http";
	port?: number;
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
	let transport: "stdio" | "http" | undefined;
	let port: number | undefined;

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
		const transportMatch = raw.match(/^--transport=(stdio|http)$/i);
		if (transportMatch) {
			transport = transportMatch[1].toLowerCase() as "stdio" | "http";
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
	}
	if (!apiKey) {
		apiKey = env.HEVY_API_KEY || "";
	}

	return {
		apiKey,
		transport,
		port,
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
