import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: "./wrangler.test.jsonc",
			},
		}),
	],
	test: {
		// Workerd cold starts can exceed Vitest's five-second default on shared
		// runners; keep the test lane reliable before caching its result.
		testTimeout: 15_000,
		include: ["tests/cloudflare/**/*.test.ts"],
	},
});
