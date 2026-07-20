import { readFileSync } from "node:fs";
import { codecovRollupPlugin } from "@codecov/rollup-plugin";
import { sentryRollupPlugin } from "@sentry/rollup-plugin";
import { defineConfig } from "tsdown";

interface PackageJsonMeta {
	name?: unknown;
	version?: unknown;
}

const pkgJsonRaw = readFileSync(
	new URL("./package.json", import.meta.url),
	"utf-8",
);
let parsed: PackageJsonMeta;
try {
	parsed = JSON.parse(pkgJsonRaw) as PackageJsonMeta;
} catch (error) {
	throw new Error(`Failed to parse package.json: ${(error as Error).message}`);
}

const { name, version } = parsed;
const isStandaloneBuild = process.env.HEVY_MCP_BUILD_MODE === "standalone";
const codecovToken = process.env.CODECOV_TOKEN?.trim() || undefined;
const enableCodecovBundleAnalysis =
	!isStandaloneBuild && codecovToken !== undefined;

if (process.env.HEVY_MCP_RELEASE === "true") {
	const missing: string[] = [];
	if (!process.env.OTEL_COLLECTOR_TOKEN) missing.push("OTEL_COLLECTOR_TOKEN");
	if (!process.env.SENTRY_ORG) missing.push("SENTRY_ORG");
	if (!process.env.SENTRY_PROJECT) missing.push("SENTRY_PROJECT");
	if (!process.env.SENTRY_AUTH_TOKEN) missing.push("SENTRY_AUTH_TOKEN");

	if (missing.length > 0) {
		throw new Error(
			`Release build failed: Missing required environment variables: ${missing.join(
				", ",
			)}`,
		);
	}
}

if (
	typeof name !== "string" ||
	typeof version !== "string" ||
	!name ||
	!version
) {
	throw new Error(
		`package.json must provide non-empty string 'name' and 'version'. Got name=${String(
			name,
		)}, version=${String(version)}`,
	);
}
export default defineConfig({
	entry: isStandaloneBuild ? ["src/cli.ts"] : ["src/index.ts", "src/cli.ts"],
	format: ["esm"],
	platform: isStandaloneBuild ? "node" : undefined,
	target: isStandaloneBuild ? "node24" : "esnext",
	define: {
		__HEVY_MCP_BUILD__: "true",
		__HEVY_MCP_NAME__: JSON.stringify(name),
		__HEVY_MCP_VERSION__: JSON.stringify(version),
		__OTEL_COLLECTOR_TOKEN__: JSON.stringify(
			process.env.OTEL_COLLECTOR_TOKEN ?? "",
		),
	},
	sourcemap: !isStandaloneBuild,
	clean: true,
	dts: !isStandaloneBuild,
	deps: isStandaloneBuild
		? {
				alwaysBundle: [/.*/],
				onlyBundle: false,
			}
		: undefined,
	banner: {
		js: "#!/usr/bin/env node\n// Generated with tsdown\n// https://tsdown.dev",
	},
	outDir: "dist",
	outputOptions: isStandaloneBuild
		? {
				codeSplitting: false,
				entryFileNames: "standalone.mjs",
			}
		: undefined,
	inputOptions: {
		onLog(level, log, defaultHandler) {
			if (
				typeof log === "object" &&
				log !== null &&
				"code" in log &&
				log.code === "SOURCEMAP_BROKEN"
			) {
				return;
			}
			defaultHandler(level, log);
		},
	},
	plugins: [
		sentryRollupPlugin({
			org: process.env.SENTRY_ORG,
			project: process.env.SENTRY_PROJECT,
			authToken: process.env.SENTRY_AUTH_TOKEN,
			telemetry: false,
			sourcemaps: {
				assets: ["./dist/**/*.mjs", "./dist/**/*.map"],
			},
			release: {
				name: `${name}@${version}`,
			},
		}),
		...(enableCodecovBundleAnalysis
			? codecovRollupPlugin({
					enableBundleAnalysis: true,
					bundleName: "hevy-mcp",
					uploadToken: codecovToken,
				})
			: []),
	],
});
