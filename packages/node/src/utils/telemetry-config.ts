declare const __HEVY_MCP_BUILD__: boolean | undefined;
declare const __HEVY_MCP_VERSION__: string | undefined;

const isBuilt =
	typeof __HEVY_MCP_BUILD__ !== "undefined" && __HEVY_MCP_BUILD__ === true;
// Without an injected version the release is reported as `hevy-mcp@dev`.
// Such builds come from local checkouts and must never count as production.
const isVersionedBuild =
	isBuilt &&
	typeof __HEVY_MCP_VERSION__ === "string" &&
	__HEVY_MCP_VERSION__ !== "" &&
	__HEVY_MCP_VERSION__ !== "dev";
const setting = process.env.HEVY_MCP_TELEMETRY;

// Published builds retain opt-out telemetry; source-run probes require opt-in.
export const telemetryEnabled = setting === "1" || (isBuilt && setting !== "0");
export const sentryEnvironment =
	process.env.SENTRY_ENVIRONMENT ??
	(isVersionedBuild ? "production" : "development");
