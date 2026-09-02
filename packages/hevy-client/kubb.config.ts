import { adapterOas } from "@kubb/adapter-oas";
import { pluginFetch } from "@kubb/plugin-fetch";
import { pluginTs } from "@kubb/plugin-ts";
import { pluginZod } from "@kubb/plugin-zod";
import { defineConfig } from "kubb/config";
import { fsStorage } from "kubb/kit";
import { fileURLToPath } from "node:url";

const clientRoot = fileURLToPath(new URL("./", import.meta.url));
const baseStorage = fsStorage();

/** Kubb owns the generated API contract for the hevy-client workspace. */
export default defineConfig({
	root: clientRoot,
	input: fileURLToPath(new URL("../../openapi-spec.json", import.meta.url)),
	output: {
		// Kubb resolves output paths from the workspace process directory.
		path: "./src/generated",
		clean: true,
		barrel: { type: "named" },
	},
	storage: {
		...baseStorage,
		async writeItem(key, value) {
			if (key.endsWith(".kubb/client.ts") || key.endsWith(".kubb/client.js")) {
				// Cloudflare Workers RequestInit intentionally does not define `credentials`.
				// Cast init to any so .kubb/client.ts compiles in Cloudflare Worker environments.
				const patched = value.replace(
					/if\s*\(\s*request\.credentials\s*\)\s*init\.credentials\s*=\s*request\.credentials;?/g,
					"if (request.credentials) (init as any).credentials = request.credentials;",
				);
				return baseStorage.writeItem(key, patched);
			}
			return baseStorage.writeItem(key, value);
		},
	},
	adapter: adapterOas({
		integerType: "number",
	}),
	plugins: [
		pluginTs({
			output: { path: "./client/types", barrel: { type: "named" } },
		}),
		pluginFetch({
			output: { path: "./client/api", barrel: { type: "named" } },
		}),
		pluginZod({
			output: { path: "./client/schemas", barrel: { type: "named" } },
			coercion: { numbers: true },
		}),
	],
});
