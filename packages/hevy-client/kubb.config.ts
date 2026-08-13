import { defineConfig } from "@kubb/core";
import { pluginClient } from "@kubb/plugin-client";
import { pluginOas } from "@kubb/plugin-oas";
import { pluginTs } from "@kubb/plugin-ts";
import { pluginZod } from "@kubb/plugin-zod";
import { fileURLToPath } from "node:url";

const clientRoot = fileURLToPath(new URL("./", import.meta.url));

/** Kubb owns the generated API contract for the hevy-client workspace. */
export default defineConfig({
	root: clientRoot,
	input: {
		path: fileURLToPath(new URL("../../openapi-spec.json", import.meta.url)),
	},
	output: {
		// Kubb resolves output paths from the workspace process directory.
		path: "./src/generated",
		clean: true,
		format: "oxfmt",
	},
	plugins: [
		pluginOas({ output: { path: "./client" } }),
		pluginTs({ output: { path: "./client/types" } }),
		pluginClient({
			output: { path: "./client/api" },
			// Keep the generated operations on the runtime-neutral client adapter.
			// Kubb's bundled fetch template sets `credentials`, which Cloudflare's
			// RequestInit intentionally does not support.
			importPath: "../../../fetch.ts",
		}),
		pluginZod({ output: { path: "./client/schemas" } }),
	],
});
