import { Layer } from "effect";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import { createOperations, type HevyOperations } from "@hevy-mcp/operations";
import {
	ExerciseTemplateCatalogService,
	HevyClientService,
	HevyOperationsService,
	ToolExecutionContextService,
	ToolObserverService,
} from "./effect-services.js";
import type { ToolExecutionContext } from "./execution.js";
import type { ToolObserver } from "./observation.js";
import type { ExerciseTemplateCatalog } from "./utils/exercise-template-catalog.js";

export interface CoreServiceLayerOptions {
	readonly client: HevyClient;
	readonly catalog: ExerciseTemplateCatalog;
	readonly execution: ToolExecutionContext;
	readonly operations?: HevyOperations;
}

/**
 * Build the runtime-neutral dependency graph for an Effect program.
 *
 * This is deliberately additive: current MCP registration still uses
 * ToolRuntime, while new code can request these services without constructing
 * a parallel container or binding client argument positions through a Proxy.
 */
export function createCoreServiceLayer({
	client,
	catalog,
	execution,
	operations = createOperations(client),
}: CoreServiceLayerOptions): Layer.Layer<
	| HevyClientService
	| HevyOperationsService
	| ExerciseTemplateCatalogService
	| ToolExecutionContextService
> {
	return Layer.mergeAll(
		Layer.succeed(HevyClientService, client),
		Layer.succeed(HevyOperationsService, operations),
		Layer.succeed(ExerciseTemplateCatalogService, catalog),
		Layer.succeed(ToolExecutionContextService, execution),
	);
}

export function createToolObserverLayer(
	observer: ToolObserver,
): Layer.Layer<ToolObserverService> {
	return Layer.succeed(ToolObserverService, observer);
}
