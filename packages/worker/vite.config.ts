import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

const persistencePath = process.env.HEVY_WORKER_PERSIST_DIR;
const inspectorPort = process.env.HEVY_WORKER_INSPECTOR_PORT;

export default defineConfig({
	plugins: [
		cloudflare({
			experimental: { newConfig: { cfBuildOutput: true } },
			inspectorPort: inspectorPort ? Number(inspectorPort) : undefined,
			persistState: persistencePath ? { path: persistencePath } : true,
			remoteBindings: false,
		}),
	],
	server: {
		cors: false,
		host: process.env.HEVY_WORKER_DEV_HOST ?? "127.0.0.1",
		port: Number(process.env.HEVY_WORKER_DEV_PORT ?? 8787),
		strictPort: true,
	},
});
