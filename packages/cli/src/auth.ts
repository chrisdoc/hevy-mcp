import { UsageError } from "./arguments.js";

export function getApiKey(env: Record<string, string | undefined>): string {
	const key = env.HEVY_API_KEY?.trim();
	if (!key)
		throw new UsageError("HEVY_API_KEY is required; set it in the environment");
	return key;
}
