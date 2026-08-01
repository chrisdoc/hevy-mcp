import { bindings, defineWorker } from "wrangler/experimental-config";
import * as entrypoint from "./packages/worker/src/worker.ts" with { type: "cf-worker" };

export default defineWorker((ctx) => {
	const environment =
		process.env.WRANGLER_MODE ??
		ctx.mode ??
		process.env.CLOUDFLARE_ENV ??
		"development";
	const route = process.env.CLOUDFLARE_WORKER_ROUTE?.trim();
	const workerName =
		process.env.CLOUDFLARE_WORKER_NAME?.trim() ??
		(environment === "preview" ? "hevy-mcp-preview" : "hevy-mcp");
	const kvNamespaceId = process.env.CLOUDFLARE_OAUTH_KV_NAMESPACE_ID?.trim();
	const observability =
		environment === "production" || environment === "preview"
			? {
					enabled: true,
					traces: {
						enabled: true,
						destinations: ["otel"],
					},
					logs: {
						enabled: true,
						destinations: ["otel-logs"],
					},
				}
			: { enabled: true };

	return {
		name: workerName,
		entrypoint,
		compatibilityDate: "2026-07-11",
		compatibilityFlags: ["global_fetch_strictly_public"],
		workersDev: environment === "development",
		previewUrls: true,
		observability,
		domains: route ? [route] : undefined,
		env: {
			OAUTH_KV: bindings.kv(kvNamespaceId ? { id: kvNamespaceId } : undefined),
			...(environment === "preview"
				? { MCP_DISABLE_ORIGIN_CHECK: bindings.text("true") }
				: {}),
		},
	};
});
