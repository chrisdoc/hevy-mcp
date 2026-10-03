import { resolve } from "node:path";
import { loadAndParseConfig } from "@cloudflare/config";
import { afterEach, expect, it, vi } from "vitest";

const configPath = resolve("packages/worker/cloudflare.config.ts");

async function workerConfig(mode?: string) {
	const { result } = await loadAndParseConfig(configPath, {
		mode,
		isPreview: false,
	});
	if (!result.success) throw result.error;
	return result.data.worker;
}

afterEach(() => vi.unstubAllEnvs());

it("defaults to a portable development Worker with local OAuth KV", async () => {
	const worker = await workerConfig();
	expect(worker?.name).toBe("hevy-mcp");
	expect(worker?.workersDev).toBe(true);
	expect(worker?.env?.OAUTH_KV).toEqual({ type: "kv" });
	expect(worker?.env?.MCP_DISABLE_ORIGIN_CHECK).toBeUndefined();
});

it("exposes fake Hevy bindings only to the deterministic HTTP harness", async () => {
	vi.stubEnv("HEVY_WORKER_TEST_MODE", "true");
	vi.stubEnv("HEVY_API_BASE_URL", "http://127.0.0.1:12345");
	vi.stubEnv("HEVY_VALIDATION_RETRY_DELAYS_MS", "1,2");
	const worker = await workerConfig();
	expect(worker?.env?.HEVY_API_BASE_URL).toEqual({
		type: "text",
		value: "http://127.0.0.1:12345",
	});
	expect(worker?.env?.HEVY_VALIDATION_RETRY_DELAYS_MS).toEqual({
		type: "text",
		value: "1,2",
	});
});

it("does not expose test bindings in deployment modes", async () => {
	vi.stubEnv("HEVY_API_BASE_URL", "http://127.0.0.1:12345");
	vi.stubEnv("HEVY_VALIDATION_RETRY_DELAYS_MS", "1,2");
	const worker = await workerConfig("production");
	expect(worker?.env?.HEVY_API_BASE_URL).toBeUndefined();
	expect(worker?.env?.HEVY_VALIDATION_RETRY_DELAYS_MS).toBeUndefined();
});

it("keeps preview variables and secrets and enables PR aliases", async () => {
	const worker = await workerConfig("preview");
	expect(worker?.name).toBe("hevy-mcp-preview");
	expect(worker?.workersDev).toBe(false);
	expect(worker?.previewUrls).toBe(true);
	expect(worker?.env?.MCP_DISABLE_ORIGIN_CHECK).toEqual({
		type: "text",
		value: "true",
	});
	expect(worker?.unsafe?.metadata?.keep_bindings).toEqual([
		"plain_text",
		"json",
		"secret_text",
		"secret_key",
	]);
});

it("reads account-owned production bindings, domain and telemetry destinations", async () => {
	vi.stubEnv("CLOUDFLARE_WORKER_NAME", "example-worker");
	vi.stubEnv("CLOUDFLARE_WORKER_ROUTE", "mcp.example.com");
	vi.stubEnv(
		"CLOUDFLARE_OAUTH_KV_NAMESPACE_ID",
		"0123456789abcdef0123456789abcdef",
	);
	vi.stubEnv("CLOUDFLARE_OAUTH_RESOURCE", "https://mcp.example.com/mcp");
	vi.stubEnv("CLOUDFLARE_OTEL_LOGS_DESTINATIONS", " logs-one, logs-two, ");
	vi.stubEnv("CLOUDFLARE_OTEL_TRACES_DESTINATIONS", " traces-one ");
	const worker = await workerConfig("production");
	expect(worker?.name).toBe("example-worker");
	expect(worker?.domains).toEqual(["mcp.example.com"]);
	expect(worker?.workersDev).toBe(false);
	expect(worker?.env?.OAUTH_KV).toEqual({
		type: "kv",
		id: "0123456789abcdef0123456789abcdef",
	});
	expect(worker?.env?.OAUTH_RESOURCE).toEqual({
		type: "text",
		value: "https://mcp.example.com/mcp",
	});
	expect(worker?.env?.MCP_DISABLE_ORIGIN_CHECK).toBeUndefined();
	expect(worker?.observability?.logs?.destinations).toEqual([
		"logs-one",
		"logs-two",
	]);
	expect(worker?.observability?.traces?.destinations).toEqual(["traces-one"]);
});

it("selects the inert entrypoint only for preview bootstrap and cleanup", async () => {
	vi.stubEnv("CLOUDFLARE_PREVIEW_INERT", "true");
	expect((await workerConfig("preview"))?.entrypoint).toBe(
		resolve(".github/workers/preview-bootstrap.ts"),
	);
	expect((await workerConfig("production"))?.entrypoint).toBe(
		resolve("packages/worker/src/worker.ts"),
	);
});
