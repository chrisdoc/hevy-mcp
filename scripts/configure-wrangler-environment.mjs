import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const environment = process.env.WRANGLER_ENVIRONMENT;
const workerName = process.env.CLOUDFLARE_WORKER_NAME?.trim();
const route = process.env.CLOUDFLARE_WORKER_ROUTE?.trim();
const kvNamespaceId = process.env.CLOUDFLARE_OAUTH_KV_NAMESPACE_ID?.trim();
const outputPath = resolve(
	process.env.WRANGLER_CONFIG_OUTPUT ?? ".wrangler/config.json",
);

if (environment !== "production" && environment !== "preview") {
	throw new Error("WRANGLER_ENVIRONMENT must be production or preview");
}

if (!workerName) {
	throw new Error("CLOUDFLARE_WORKER_NAME is required");
}

if (environment === "production" && !route) {
	throw new Error("CLOUDFLARE_WORKER_ROUTE is required for production");
}

if (!kvNamespaceId) {
	throw new Error("CLOUDFLARE_OAUTH_KV_NAMESPACE_ID is required");
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(scriptDirectory, "../wrangler.jsonc");
const source = await readFile(sourcePath, "utf8");
const config = JSON.parse(
	source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|\s)\/\/.*$/gm, "$1")
		.replace(/,\s*([}\]])/g, "$1"),
);

const environmentConfig = {
	name: workerName,
	workers_dev: false,
	preview_urls: true,
	kv_namespaces: [{ binding: "OAUTH_KV", id: kvNamespaceId }],
};

if (route) {
	environmentConfig.routes = [{ pattern: route, custom_domain: true }];
}

if (environment === "preview") {
	environmentConfig.vars = { MCP_DISABLE_ORIGIN_CHECK: "true" };
}

config.env = { [environment]: environmentConfig };

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(config, null, "\t")}\n`);
console.log(`Wrote ${outputPath} for Wrangler environment ${environment}`);
