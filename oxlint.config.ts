import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
	plugins: ["typescript", "unicorn", "oxc"],
	categories: {
		correctness: "error",
	},
	options: {
		typeAware: true,
	},
	ignorePatterns: [
		...(core.ignorePatterns ?? []),
		"**/*.d.ts",
		"**/*.d.mts",
		"**/src/generated",
		"**/.agents",
		"**/.entire",
		"**/.factory",
		"**/.gemini",
		"**/.omp",
		"**/.opencode",
		"**/.pi",
		"tests/fixtures/generated-client/stale/**",
	],
	jsPlugins: [
		{
			name: "anti-slop",
			specifier: "./tools/oxlint/anti-slop/index.ts",
		},
	],
	rules: {
		"typescript/no-non-null-assertion": "error",
		"no-param-reassign": "error",
		"@typescript-eslint/consistent-type-assertions": "error",
		"default-param-last": "error",
		"@typescript-eslint/no-inferrable-types": "error",
		"typescript/no-restricted-types": [
			"error",
			{
				types: {
					"Record<string, unknown>": "Use a more specific object type.",
				},
			},
		],
		"typescript/require-await": "error",
		"unicorn/no-useless-fallback-in-spread": "off",
		"unicorn/no-useless-spread": "off",
		"no-unused-vars": [
			"error",
			{
				argsIgnorePattern: "^_",
				varsIgnorePattern: "^_",
				caughtErrorsIgnorePattern: "^_",
			},
		],
		"await-thenable": "error",
		"no-floating-promises": "error",
		"anti-slop/no-chained-type-assertions": "error",
		"anti-slop/no-conditional-empty-object-spread": "error",
		"anti-slop/no-known-value-widening": "error",
		"anti-slop/no-object-parameters": "error",
		"anti-slop/no-runtime-typeof": "error",
		"anti-slop/no-shape-in-symbol-names": "error",
		"anti-slop/no-unknown-parameters": "error",
		"anti-slop/no-unknown-type-aliases": "error",
		"anti-slop/no-unsafe-dictionary-type": "error",
		"anti-slop/no-widen-then-assert": "error",
	},
});
