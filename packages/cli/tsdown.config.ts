import { readFileSync } from "node:fs";
import { defineConfig } from "tsdown";

const { version } = JSON.parse(
	readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
	entry: ["src/cli.ts"],
	format: ["esm"],
	platform: "node",
	target: "node24",
	dts: false,
	clean: true,
	outDir: "dist",
	deps: {
		alwaysBundle: [
			"@hevy-mcp/hevy-client",
			"@hevy-mcp/core",
			"@stricli/core",
			"zod",
		],
		onlyBundle: false,
	},
	define: { __HEVY_CLI_VERSION__: JSON.stringify(version) },
	outputOptions: { codeSplitting: false, entryFileNames: "cli.mjs" },
	banner: { js: "#!/usr/bin/env node" },
});
