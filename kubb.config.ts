import { defineConfig } from "@kubb/core";
import { pluginClient } from "@kubb/plugin-client";
import { pluginFaker } from "@kubb/plugin-faker";
import { pluginOas } from "@kubb/plugin-oas";
import { pluginTs } from "@kubb/plugin-ts";
import { pluginZod } from "@kubb/plugin-zod";

export default defineConfig({
	root: ".",
	input: {
		path: "./openapi-spec.json",
	},
	output: {
		path: "./src/generated",
		clean: true,
	},
	hooks: {
		done: ["npm run check"],
	},
	plugins: [
		pluginOas({
			output: {
				path: "./client",
			},
		}),
		pluginTs({
			output: {
				path: "./client/types",
			},
		}),
		pluginClient({
			output: {
				path: "./client/api",
			},
			clients: [
				{
					client: "axios",
					options: {
						baseUrl: "https://api.hevyapp.com",
						headers: {
							"api-key": "{api-key}",
						},
					},
				},
			],
		}),
		pluginZod({
			output: {
				path: "./client/schemas",
			},
		}),
		pluginFaker({
			output: {
				path: "./client/mocks",
			},
		}),
	],
});
