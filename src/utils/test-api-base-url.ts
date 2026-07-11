const PRODUCTION_API_BASE_URL = "https://api.hevyapp.com";
const TEST_API_BASE_URL_ENV = "HEVY_MCP_TEST_API_BASE_URL";

function invalidTestApiBaseUrl(reason: string): never {
	throw new Error(`${TEST_API_BASE_URL_ENV} is invalid: ${reason}`);
}

export function resolveApiBaseUrl(
	env: NodeJS.ProcessEnv = process.env,
): string {
	const configuredUrl = env[TEST_API_BASE_URL_ENV];
	if (env.NODE_ENV !== "test" || configuredUrl === undefined) {
		return PRODUCTION_API_BASE_URL;
	}

	let parsed: URL;
	try {
		parsed = new URL(configuredUrl);
	} catch {
		return invalidTestApiBaseUrl("expected an absolute URL");
	}

	if (parsed.protocol !== "http:") {
		return invalidTestApiBaseUrl("protocol must be http:");
	}

	if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "[::1]") {
		return invalidTestApiBaseUrl(
			"hostname must be numeric loopback 127.0.0.1 or [::1]",
		);
	}

	if (!parsed.port) {
		return invalidTestApiBaseUrl("an explicit port is required");
	}

	if (parsed.pathname !== "/") {
		return invalidTestApiBaseUrl("path must be the URL root");
	}

	if (parsed.username || parsed.password) {
		return invalidTestApiBaseUrl("credentials are not allowed");
	}

	if (parsed.search) {
		return invalidTestApiBaseUrl("query parameters are not allowed");
	}

	if (parsed.hash) {
		return invalidTestApiBaseUrl("fragments are not allowed");
	}

	return parsed.origin;
}
