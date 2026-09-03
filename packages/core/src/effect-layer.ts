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

export type CoreServiceIdentifiers =
	| HevyClientService
	| HevyOperationsService
	| ExerciseTemplateCatalogService
	| ToolExecutionContextService;

export type CoreServiceLayer = Layer.Layer<CoreServiceIdentifiers>;

/**
 * Build the runtime-neutral dependency graph for an Effect program.
 *
 * The returned layer is intentionally request-local. ToolRuntime builds it
 * for each runtime or execution scope rather than installing a process-wide
 * Effect runtime.
 */
export function createCoreServiceLayer({
	client,
	catalog,
	execution,
	operations = createOperations(client),
}: CoreServiceLayerOptions): CoreServiceLayer {
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
