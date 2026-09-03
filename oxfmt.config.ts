import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
	...ultracite,
	useTabs: true,
	tabWidth: 2,
	trailingComma: "all",
	sortImports: false,
	proseWrap: "preserve",
	ignorePatterns: [
		...(ultracite.ignorePatterns ?? []).filter(
			(pattern) => pattern !== "**/generated" && pattern !== "**/src/generated",
		),
		"**/CHANGELOG.md",
		"**/issue-artifacts/**",
		"**/.agents",
		"**/.entire",
		"**/.factory",
		"**/.gemini",
		"**/.omp",
		"**/.opencode",
		"**/.pi",
	],
	overrides: [
		{
			files: ["**/src/generated/**/*"],
			options: { useTabs: false },
		},
	],
});
