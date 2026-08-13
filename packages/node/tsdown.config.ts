/// <reference types="node" />
import { readFileSync } from "node:fs";
import { z } from "zod";
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
const isReleaseBuild = process.env.HEVY_MCP_RELEASE === "true";
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
	!z.string().safeParse(name).success ||
	!z.string().safeParse(version).success ||
	!name ||
	!version
) {
	throw new Error(
		`package.json must provide non-empty string 'name' and 'version'. Got name=${String(
			name,
		)}, version=${String(version)}`,
	);
}

const packageName = name as string;
const packageVersion = version as string;

function createReleaseSentryPlugin() {
	const [plugin] = sentryRollupPlugin({
		org: process.env.SENTRY_ORG,
		project: process.env.SENTRY_PROJECT,
		authToken: process.env.SENTRY_AUTH_TOKEN,
		telemetry: false,
		sourcemaps: {
			assets: ["./dist/**/*.mjs", "./dist/**/*.map"],
			filesToDeleteAfterUpload: ["./dist/**/*.map"],
		},
		release: {
			name: `${packageName}@${packageVersion}`,
			inject: false,
		},
	});
	if (!plugin) throw new Error("Sentry release plugin was not created");

	const originalRenderChunk = plugin.renderChunk;
	return {
		...plugin,
		renderChunk(
			code: string,
			chunk: { facadeModuleId?: string | null; moduleIds?: string[] },
			options: unknown,
			meta: unknown,
		) {
			const normalizeModuleId = (moduleId: string) =>
				moduleId.replaceAll("\\", "/");
			const isExecutableModule = (moduleId: string | null | undefined) => {
				const normalized = moduleId && normalizeModuleId(moduleId);
				return (
					normalized === "src/cli.ts" ||
					normalized?.endsWith("/src/cli.ts") ||
					normalized === "src/runtime.ts" ||
					normalized?.endsWith("/src/runtime.ts")
				);
			};
			// The published package root is an embedding surface. Inject Sentry
			// debug IDs into the executable entry and its lazy runtime chunk;
			// shared chunks imported by the embedding entry must remain inert.
			const isExecutableChunk = [
				chunk.facadeModuleId,
				...(chunk.moduleIds ?? []),
			].some(isExecutableModule);
			if (!isExecutableChunk) return null;
			return originalRenderChunk?.call(this, code, chunk, options, meta);
		},
	};
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
	// Release builds upload source maps to Sentry and remove them after upload;
	// normal and published builds intentionally omit them.
	sourcemap: isReleaseBuild,
	clean: true,
	dts: !isStandaloneBuild,
	deps: isStandaloneBuild
		? {
				alwaysBundle: [/.*/],
				onlyBundle: false,
			}
		: {
				// Keep the private workspace graph inside the public artifact. Only
				// Node's declared runtime dependencies remain external.
				alwaysBundle: [
					"@hevy-mcp/core",
					"@hevy-mcp/hevy-client",
					"@hevy-mcp/operations",
				],
			},
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
				z.object({}).passthrough().safeParse(log).success &&
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
		...(isReleaseBuild ? [createReleaseSentryPlugin()] : []),
		...(enableCodecovBundleAnalysis
			? codecovRollupPlugin({
					enableBundleAnalysis: true,
					bundleName: "hevy-mcp",
					uploadToken: codecovToken,
				})
			: []),
	],
});
