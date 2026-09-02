import { Context } from "effect";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import type { HevyOperations } from "@hevy-mcp/operations";
import type { ToolExecutionContext } from "./execution.js";
import type { ToolObserver } from "./observation.js";
import type { ExerciseTemplateCatalog } from "./utils/exercise-template-catalog.js";

/**
 * Effect service tags for the runtime dependencies used by MCP execution.
 *
 * These tags establish the dependency-injection seam without changing the
 * existing Promise-based runtime. Later migrations can provide these services
 * at the adapter boundary while existing ToolRuntime callers remain intact.
 */
export class HevyClientService extends Context.Service<
	HevyClientService,
	HevyClient
>()("hevy-mcp/core/HevyClient") {}

export class HevyOperationsService extends Context.Service<
	HevyOperationsService,
	HevyOperations
>()("hevy-mcp/core/HevyOperations") {}

export class ExerciseTemplateCatalogService extends Context.Service<
	ExerciseTemplateCatalogService,
	ExerciseTemplateCatalog
>()("hevy-mcp/core/ExerciseTemplateCatalog") {}

export class ToolObserverService extends Context.Service<
	ToolObserverService,
	ToolObserver
>()("hevy-mcp/core/ToolObserver") {}

export class ToolExecutionContextService extends Context.Service<
	ToolExecutionContextService,
	ToolExecutionContext
>()("hevy-mcp/core/ToolExecutionContext") {}
