import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			provider: "v8",
			reportsDirectory: "coverage",
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/generated/**", "tests/performance/**"],
			reporter: ["text", "json-summary", "lcov"],
			thresholds: {
				statements: 85,
				lines: 85,
				functions: 85,
				branches: 75,
			},
		},
	},
});
