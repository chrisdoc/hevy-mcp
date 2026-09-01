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
export class HevyClientService extends Context.Tag("HevyClientService")<
	HevyClientService,
	HevyClient
>() {}

export class HevyOperationsService extends Context.Tag("HevyOperationsService")<
	HevyOperationsService,
	HevyOperations
>() {}

export class ExerciseTemplateCatalogService extends Context.Tag(
	"ExerciseTemplateCatalogService",
)<ExerciseTemplateCatalogService, ExerciseTemplateCatalog>() {}

export class ToolObserverService extends Context.Tag("ToolObserverService")<
	ToolObserverService,
	ToolObserver
>() {}

export class ToolExecutionContextService extends Context.Tag(
	"ToolExecutionContextService",
)<ToolExecutionContextService, ToolExecutionContext>() {}
