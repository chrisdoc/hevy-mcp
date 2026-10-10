declare const __HEVY_MCP_BUILD__: boolean | undefined;

const isBuilt =
	typeof __HEVY_MCP_BUILD__ !== "undefined" && __HEVY_MCP_BUILD__ === true;
const setting = process.env.HEVY_MCP_TELEMETRY;

// Published builds retain opt-out telemetry; source-run probes require opt-in.
export const telemetryEnabled = setting === "1" || (isBuilt && setting !== "0");
export const sentryEnvironment =
	process.env.SENTRY_ENVIRONMENT ?? (isBuilt ? "production" : "development");
