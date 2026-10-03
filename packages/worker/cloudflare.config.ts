import { bindings, defineConfig, defineWorker } from "@cloudflare/config";
import * as inertEntrypoint from "../../.github/workers/preview-bootstrap.ts" with { type: "cf-worker" };
import * as entrypoint from "./src/worker.ts" with { type: "cf-worker" };

interface WorkerObservability {
	enabled: true;
	issues?: { enabled: boolean };
	traces?: { enabled: true; destinations: string[] };
	logs?: { enabled: true; destinations: string[] };
}

interface WorkerEnvironmentBindings {
	[key: string]:
		| ReturnType<typeof bindings.kv>
		| ReturnType<typeof bindings.text>;
	OAUTH_KV: ReturnType<typeof bindings.kv>;
}

export default defineConfig({
	worker: defineWorker((ctx) => {
		const environment = ctx.mode ?? process.env.CLOUDFLARE_ENV ?? "development";
		const route = process.env.CLOUDFLARE_WORKER_ROUTE?.trim();
		const workerName =
			process.env.CLOUDFLARE_WORKER_NAME?.trim() ??
			(environment === "preview" ? "hevy-mcp-preview" : "hevy-mcp");
		const kvNamespaceId = process.env.CLOUDFLARE_OAUTH_KV_NAMESPACE_ID?.trim();
		const oauthResource = process.env.CLOUDFLARE_OAUTH_RESOURCE?.trim();
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
		const observability: WorkerObservability = {
			enabled: true,
			issues: { enabled: true },
		};
		if (traceDestinations.length > 0)
			observability.traces = {
				enabled: true,
				destinations: traceDestinations,
			};
		if (logDestinations.length > 0)
			observability.logs = {
				enabled: true,
				destinations: logDestinations,
			};

		const env: WorkerEnvironmentBindings = {
			OAUTH_KV: bindings.kv(kvNamespaceId ? { id: kvNamespaceId } : undefined),
		};
		if (process.env.HEVY_WORKER_TEST_MODE === "true") {
			const hevyApiBaseUrl = process.env.HEVY_API_BASE_URL?.trim();
			const validationRetryDelays =
				process.env.HEVY_VALIDATION_RETRY_DELAYS_MS?.trim();
			if (hevyApiBaseUrl) env.HEVY_API_BASE_URL = bindings.text(hevyApiBaseUrl);
			if (validationRetryDelays)
				env.HEVY_VALIDATION_RETRY_DELAYS_MS = bindings.text(
					validationRetryDelays,
				);
		}
		if (oauthResource) env.OAUTH_RESOURCE = bindings.text(oauthResource);
		if (environment === "preview")
			env.MCP_DISABLE_ORIGIN_CHECK = bindings.text("true");
		return {
			name: workerName,
			entrypoint:
				environment === "preview" &&
				process.env.CLOUDFLARE_PREVIEW_INERT === "true"
					? inertEntrypoint
					: entrypoint,
			compatibilityDate: "2026-07-11",
			compatibilityFlags: ["global_fetch_strictly_public"],
			workersDev: environment === "development",
			previewUrls: true,
			observability,
			domains: route ? [route] : undefined,
			// Preserve dashboard variables and secrets when uploading PR versions.
			unsafe:
				environment === "preview"
					? {
							metadata: {
								keep_bindings: [
									"plain_text",
									"json",
									"secret_text",
									"secret_key",
								],
							},
						}
					: undefined,
			env,
		};
	}),
});
