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
				"tests/integration/**",
				"**/*.d.ts",
				"src/generated/**",
			],
		},
		// Default exclude patterns for unit tests
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			"**/.git/**",
			"tests/integration/**", // Exclude integration tests by default
		],
	},
});
