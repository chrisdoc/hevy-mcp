import { Context, Layer } from "effect";
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
	| ToolExecutionContextService
	| ToolObserverService;

export type CoreServiceLayer = Layer.Layer<CoreServiceIdentifiers>;
export type CoreServiceContext = Context.Context<CoreServiceIdentifiers>;

/**
 * Build the runtime-neutral dependency graph for an Effect program.
 *
 * The layer is used to acquire the server-owned dependency graph. Request
 * execution overlays the resulting Context without rebuilding this layer.
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
	) as CoreServiceLayer;
}

export interface CoreServiceContextOptions {
	readonly client?: HevyClient;
	readonly catalog: ExerciseTemplateCatalog;
	readonly execution?: ToolExecutionContext;
	readonly observer?: ToolObserver;
	readonly operations?: HevyOperations;
}

/**
 * Build the non-scoped fallback context used by direct ToolRuntime consumers.
 *
 * Server construction uses `Layer.build` in its caller-owned Scope instead.
 * Keeping this helper limited to already-created values means request
 * overlays never acquire or finalize resources.
 */
export function createCoreServiceContext({
	client,
	catalog,
	execution,
	observer,
	operations,
}: CoreServiceContextOptions): CoreServiceContext {
	let context = Context.empty() as CoreServiceContext;
	context = Context.add(ExerciseTemplateCatalogService, catalog)(context);
	if (client) {
		context = Context.add(HevyClientService, client)(context);
	}
	if (operations) {
		context = Context.add(HevyOperationsService, operations)(context);
	}
	if (execution) {
		context = Context.add(ToolExecutionContextService, execution)(context);
	}
	if (observer) {
		context = Context.add(ToolObserverService, observer)(context);
	}
	return context;
}

export function overlayCoreServiceContext(
	base: CoreServiceContext,
	{
		client,
		catalog,
		execution,
	}: {
		readonly client?: HevyClient;
		readonly catalog?: ExerciseTemplateCatalog;
		readonly execution?: ToolExecutionContext;
	},
): CoreServiceContext {
	let context = base;
	if (client) context = Context.add(HevyClientService, client)(context);
	if (catalog) {
		context = Context.add(ExerciseTemplateCatalogService, catalog)(context);
	}
	if (execution) {
		context = Context.add(ToolExecutionContextService, execution)(context);
	}
	return context;
}

export function createToolObserverLayer(
	observer: ToolObserver,
): Layer.Layer<ToolObserverService> {
	return Layer.succeed(ToolObserverService, observer);
}
