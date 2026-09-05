import {
	Cache,
	Effect,
} from "../../packages/core/node_modules/effect/dist/index.js";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import type { ExerciseTemplate } from "@hevy-mcp/hevy-client/types";
import type { TemplatesListAllOperation } from "@hevy-mcp/operations";
import { createOperations } from "@hevy-mcp/operations";
import {
	createExerciseTemplateCatalog,
	EXERCISE_TEMPLATE_CATALOG_CACHE_MAX_SIZE,
	EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS,
} from "../../packages/core/src/utils/exercise-template-catalog.js";

export function createIntegrationCatalog(hevyClient: HevyClient) {
	const operations = createOperations(hevyClient);
	const listAll = operations.templates?.listAll;
	if (!listAll) {
		throw new Error("Exercise template list operation is unavailable.");
	}
	const cache = Effect.runSync(
		Cache.make<
			string,
			ExerciseTemplate[],
			Effect.Error<ReturnType<TemplatesListAllOperation["effect"]>>
		>({
			capacity: EXERCISE_TEMPLATE_CATALOG_CACHE_MAX_SIZE,
			timeToLive: EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS,
			lookup: (_key: string) => listAll.effect(),
		}),
	);
	return createExerciseTemplateCatalog(operations, cache);
}
