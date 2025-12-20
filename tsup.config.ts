import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

interface PackageJsonMeta {
	name: string;
	version: string;
}

const pkgJsonRaw = readFileSync(
	new URL("./package.json", import.meta.url),
	"utf-8",
);
const { name, version } = JSON.parse(pkgJsonRaw) as PackageJsonMeta;

if (!name || !version) {
	throw new Error("package.json must provide 'name' and 'version'.");
}

export default defineConfig({
	entry: ["src/index.ts", "src/cli.ts"],
	format: ["esm"],
	target: "esnext",
	define: {
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
