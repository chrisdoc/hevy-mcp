import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			enabled: false, // Can be overridden via CLI
			reporter: ["text", "json", "html"],
			exclude: [
				"coverage/**",
				"dist/**",
				"node_modules/**",
				"**/*.d.ts",
				"src/generated/**",
			],
		},
		// Only include integration tests
		include: ["tests/integration/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
		// Don't exclude integration tests for this config
		exclude: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
	},
});
