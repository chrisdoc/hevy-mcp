import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		exclude: [...configDefaults.exclude, "tests/nightly/**"],
		coverage: {
			provider: "v8",
			reportsDirectory: "coverage",
			reporter: ["text", "lcov"],
			exclude: ["tests/performance/**"],
		},
	},
});
