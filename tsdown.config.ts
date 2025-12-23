import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/cli.ts"],
	format: ["esm"],
	target: "esnext",
	sourcemap: true,
	clean: true,
	dts: true,
	banner: {
		js: "#!/usr/bin/env node\n// Generated with tsdown\n// https://github.com/nicepkg/tsdown",
	},
	outDir: "dist",
});
