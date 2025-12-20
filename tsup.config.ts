import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

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
	entry: ["src/index.ts", "src/cli.ts"],
	format: ["esm"],
	target: "esnext",
	define: {
		__HEVY_MCP_BUILD__: "true",
		__HEVY_MCP_NAME__: JSON.stringify(name),
		__HEVY_MCP_VERSION__: JSON.stringify(version),
	},
	sourcemap: true,
	clean: true,
	dts: true,
	splitting: false,
	banner: {
		js: "#!/usr/bin/env node\n// Generated with tsup\n// https://github.com/egoist/tsup",
	},
	outDir: "dist",
	bundle: true,
});
