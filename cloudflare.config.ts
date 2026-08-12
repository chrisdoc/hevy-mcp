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
	const parseDestinations = (value: string | undefined) =>
		value
			?.split(",")
			.map((destination) => destination.trim())
			.filter(Boolean) ?? [];
	const traceDestinations = parseDestinations(
		process.env.CLOUDFLARE_OTEL_TRACES_DESTINATIONS,
	);
	const logDestinations = parseDestinations(
		process.env.CLOUDFLARE_OTEL_LOGS_DESTINATIONS,
	);
	const observability: {
		enabled: true;
		traces?: { enabled: true; destinations: string[] };
		logs?: { enabled: true; destinations: string[] };
	} = {
		enabled: true,
	};
	if (traceDestinations.length > 0) observability.traces = { enabled: true, destinations: traceDestinations };
	if (logDestinations.length > 0) observability.logs = { enabled: true, destinations: logDestinations };

	const env: { OAUTH_KV: ReturnType<typeof bindings.kv>; MCP_DISABLE_ORIGIN_CHECK?: ReturnType<typeof bindings.text> } = {
		OAUTH_KV: bindings.kv(kvNamespaceId ? { id: kvNamespaceId } : undefined),
	};
	if (environment === "preview") env.MCP_DISABLE_ORIGIN_CHECK = bindings.text("true");
	return {
		name: workerName,
		entrypoint,
		compatibilityDate: "2026-07-11",
		compatibilityFlags: ["global_fetch_strictly_public"],
		workersDev: environment === "development",
		previewUrls: true,
		observability,
		domains: route ? [route] : undefined,
		env,
	};
});
