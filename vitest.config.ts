import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			// @cloudflare/workers-oauth-provider imports this Workers runtime
			// module; outside workerd it needs a shim.
			"cloudflare:workers": fileURLToPath(
				new URL("./tests/shims/cloudflare-workers.ts", import.meta.url),
			),
		},
	},
	test: {
		server: {
			deps: {
				// Inline so the `cloudflare:workers` alias above applies to the
				// library's own import of that runtime-only module.
				inline: ["@cloudflare/workers-oauth-provider"],
			},
		},
		exclude: [...configDefaults.exclude, "tests/nightly/**"],
		coverage: {
			provider: "v8",
			reportsDirectory: "coverage",
			reporter: ["text", "lcov"],
			exclude: ["tests/performance/**"],
		},
	},
});
