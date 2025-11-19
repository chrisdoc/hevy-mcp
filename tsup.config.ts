import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	target: "esnext",
	sourcemap: true,
	clean: true,
	dts: true,
	splitting: false,
	banner: {
		js: "// Generated with tsup\n// https://github.com/egoist/tsup",
	},
	outDir: "dist",
	bundle: true,
});
