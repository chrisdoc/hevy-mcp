/** @deprecated The Worker entrypoint moved to @hevy-mcp/worker. */
export {
	default,
	createWorkerFetchHandler,
	createWorkerHandler,
	parseAllowedOrigins,
	parseBearerApiKey,
	type WorkerEnv,
} from "../packages/worker/src/worker.js";
