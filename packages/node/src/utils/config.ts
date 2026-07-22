export interface HevyConfig {
	apiKey?: string;
}

export class MissingHevyApiKeyError extends Error {
	constructor() {
		super(
			"Hevy API key is required. Provide it via the HEVY_API_KEY environment variable.",
		);
		this.name = "MissingHevyApiKeyError";
	}
}

export function parseConfig(env: NodeJS.ProcessEnv): HevyConfig {
	return {
		apiKey: env.HEVY_API_KEY || "",
	};
}

export function assertApiKey(
	apiKey: string | undefined,
): asserts apiKey is string {
	if (!apiKey) {
		throw new MissingHevyApiKeyError();
	}
}
